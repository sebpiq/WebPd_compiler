/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { DspGraph, getters, traversal } from '../dsp-graph'
import { mapObject } from '../functional-helpers'
import {
    attachNodePortlet,
    attachOutletListenersAndInletCallers,
} from './code-variable-names'
import { getNodeImplementation } from './compile-helpers'
import generateLoopInline from './generate-loop-inline'
import { createNamespace, nodeNamespaceLabel } from './namespace'
import { Compilation, Precompilation } from './types'

export const initializePrecompilation = (
    graph: DspGraph.Graph
): Precompilation =>
    createNamespace(
        'precompilation',
        mapObject(graph, (node) =>
            createNamespace(nodeNamespaceLabel(node), {
                rcvs: createNamespace(nodeNamespaceLabel(node, 'rcvs'), {}),
                outs: createNamespace(nodeNamespaceLabel(node, 'outs'), {}),
                snds: createNamespace(nodeNamespaceLabel(node, 'snds'), {}),
                ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {}),
            })
        )
    )

export default (compilation: Compilation) => {
    const {
        variableNamesIndex,
        precompilation,
        graphTraversalDeclare,
        graphTraversalLoop,
        graph,
    } = compilation

    attachOutletListenersAndInletCallers(compilation)

    // Go through the graph and precompile inlets / outlets.
    // For example if a node has only one sink there is no need
    // to copy values between outlet and sink's inlet. Instead we can
    // collapse these two variables into one.
    _graphTraversalInflate(compilation, graphTraversalDeclare).forEach(
        (node) => {
            Object.values(node.outlets).forEach((outlet) => {
                if (outlet.type === 'signal') {
                    _precompileSignalOutlet(compilation, node, outlet.id)
                } else if (outlet.type === 'message') {
                    _precompileMessageOutlet(compilation, node, outlet.id)
                }
            })

            Object.values(node.inlets).forEach((inlet) => {
                if (inlet.type === 'signal') {
                    _precompileSignalInlet(compilation, node, inlet.id)
                } else if (inlet.type === 'message') {
                    _precompileMessageInlet(compilation, node, inlet.id)
                }
            })
        }
    )

    // This must come after we have assigned all node variables, so we can use ins from
    // inlined signal nodes
    _graphTraversalInflate(compilation, graphTraversalDeclare).forEach(
        (leafNode) => {
            const sink = _getInlineNodeSinkList(leafNode)[0]
            if (!sink) {
                return
            }
            const sinkNode = getters.getNode(graph, sink.nodeId)
            const isLeafNode =
                _isNodeInlinable(compilation, leafNode) &&
                !_isNodeInlinable(compilation, sinkNode)

            // We filter nodes that are leaves of an inlinable subtree.
            if (!isLeafNode) {
                return
            }

            const inlineNodeTraversal = traversal.signalNodes(
                graph,
                [leafNode],
                (sourceNode) => _isNodeInlinable(compilation, sourceNode)
            )

            precompilation[sink.nodeId].ins[sink.portletId] =
                generateLoopInline(compilation, inlineNodeTraversal)

            // We don't want inlined nodes to be handled by the generateLoop
            // function, so we remove them from the graphTraversalLoop.
            inlineNodeTraversal.forEach((nodeId) => {
                const found = graphTraversalLoop.indexOf(nodeId)
                if (found !== -1) {
                    graphTraversalLoop.splice(found, 1)
                }
            })
        }
    )

    // Copy code variable names over to precompilation object.
    Object.entries(variableNamesIndex.nodes).forEach(
        ([nodeId, nodeVariableNames]) => {
            ;(['outs', 'snds', 'rcvs'] as const).forEach((ns) => {
                Object.keys(nodeVariableNames[ns]).forEach((portletId) => {
                    if (!(portletId in precompilation[nodeId][ns])) {
                        precompilation[nodeId][ns][portletId] =
                            nodeVariableNames[ns][portletId]
                    }
                })
            })
        }
    )
}

const _precompileSignalOutlet = (
    compilation: Compilation,
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const { precompilation } = compilation
    const outletSinks = getters.getSinks(node, outletId)

    // Signal inlets can receive input from ONLY ONE signal.
    // Therefore, we substitute inlet variable directly with
    // previous node's outs. e.g. instead of :
    //
    //      NODE2_IN = NODE1_OUT
    //      NODE2_OUT = NODE2_IN * 2
    //
    // we will have :
    //
    //      NODE2_OUT = NODE1_OUT * 2
    //
    if (!_isNodeInlinable(compilation, node)) {
        const outName = attachNodePortlet(
            compilation,
            'outs',
            node.id,
            outletId
        )
        outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
            precompilation[sinkNodeId].ins[inletId] = outName
        })
    }
}

const _precompileMessageOutlet = (
    compilation: Compilation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const { variableNamesIndex, precompilation, outletListenerSpecs } =
        compilation
    const nodeOutletListenerSpecs = outletListenerSpecs[sourceNode.id] || []

    // For a message outlet that sends to a single sink node
    // its out can be directly replaced by next node's in.
    // e.g. instead of (which is useful if several sinks) :
    //
    //      const NODE1_SND = (m) => {
    //          NODE2_RCV(m)
    //      }
    //      // ...
    //      NODE1_SND(m)
    //
    // we can directly substitute NODE1_SND by NODE2_RCV :
    //
    //      NODE2_RCV(m)
    //
    if (
        outletSinks.length === 1 &&
        !nodeOutletListenerSpecs.includes(outletId)
    ) {
        const rcvName = attachNodePortlet(
            compilation,
            'rcvs',
            outletSinks[0].nodeId,
            outletSinks[0].portletId
        )
        precompilation[sourceNode.id].snds[outletId] = rcvName

        // Same thing if there's no sink, but one outlet listener
    } else if (
        outletSinks.length === 0 &&
        nodeOutletListenerSpecs.includes(outletId)
    ) {
        precompilation[sourceNode.id].snds[outletId] =
            variableNamesIndex.outletListeners[sourceNode.id][outletId]

        // If no sink, no message receiver, we assign the node SND
        // a function that does nothing
    } else if (
        outletSinks.length === 0 &&
        !nodeOutletListenerSpecs.includes(outletId)
    ) {
        precompilation[sourceNode.id].snds[outletId] =
            compilation.variableNamesIndex.globs.nullMessageReceiver

        // Otherwise, there are several sinks, we then need to generate
        // a function to send messages to all sinks, e.g. :
        //
        //      const NODE1_SND = (m) => {
        //          NODE3_RCV(m)
        //          NODE2_RCV(m)
        //      }
        //
    } else {
        attachNodePortlet(compilation, 'snds', sourceNode.id, outletId)
    }
}

const _precompileSignalInlet = (
    compilation: Compilation,
    sinkNode: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const { precompilation, variableNamesIndex } = compilation
    if (getters.getSources(sinkNode, inletId).length === 0) {
        // If signal inlet has no source, we assign it a constant value of 0.
        precompilation[sinkNode.id].ins[inletId] =
            variableNamesIndex.globs.nullSignal
    } else {
        // No need to declare ins if node has source as it should be precompiled
        // from source's connected out.
    }
}

const _precompileMessageInlet = (
    compilation: Compilation,
    sinkNode: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const { inletCallerSpecs } = compilation
    const nodeInletCallerSpecs = inletCallerSpecs[sinkNode.id] || []
    const inletSources = getters.getSources(sinkNode, inletId)
    const sourcesCount =
        inletSources.length + +nodeInletCallerSpecs.includes(inletId)

    if (sourcesCount >= 1) {
        attachNodePortlet(compilation, 'rcvs', sinkNode.id, inletId)
    } else {
        // If sourcesCount === 0, no need to declare rcv
    }
}

const _graphTraversalInflate = (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
) => {
    const { graph } = compilation
    return graphTraversal.map<DspGraph.Node>((nodeId) =>
        getters.getNode(graph, nodeId)
    )
}

const _isNodeInlinable = (compilation: Compilation, node: DspGraph.Node) => {
    const { nodeImplementations } = compilation
    const sinkList = _getInlineNodeSinkList(node)
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        node.type
    )
    return !!nodeImplementation.generateLoopInline && sinkList.length === 1
}

/**
 * Inline node has only one outlet, but that outlet can be connected to
 * several sinks.
 */
const _getInlineNodeSinkList = (
    node: DspGraph.Node
): Array<DspGraph.ConnectionEndpoint> => Object.values(node.sinks)[0] || []
