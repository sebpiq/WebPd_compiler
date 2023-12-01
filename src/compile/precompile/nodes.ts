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
import { assertFuncSignatureEqual } from '../../ast/ast-helpers'
import { AnonFunc, Func, Var, ast } from '../../ast/declare'
import render from '../../ast/render'
import { Code } from '../../ast/types'
import { DspGraph, getters, traversal } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { getNodeImplementation, getMacros } from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../namespace'
import { Compilation } from '../types'
import { attachNodePortlet } from '../variable-names-index'

type InlinedNodes = { [nodeId: DspGraph.NodeId]: Code }
type InlinedInputs = { [inletId: DspGraph.PortletId]: Code }

const MESSAGE_RECEIVER_SIGNATURE = AnonFunc([Var('Message', 'm')], 'void')``

export const precompileSignalOutlet = (
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
    if (!isInlinableNode(compilation, node)) {
        const signalOutName = attachNodePortlet(
            compilation,
            'signalOuts',
            node.id,
            outletId
        )
        precompilation.nodes[node.id].signalOuts[outletId] = signalOutName
        precompilation.nodes[node.id].generationContext.signalOuts[outletId] =
            signalOutName
        outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
            precompilation.nodes[sinkNodeId].generationContext.signalIns[
                inletId
            ] = signalOutName
        })
    }
}

export const precompileSignalInlet = (
    compilation: Compilation,
    sinkNode: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const { precompilation, variableNamesIndex } = compilation
    if (getters.getSources(sinkNode, inletId).length === 0) {
        // If signal inlet has no source, we assign it a constant value of 0.
        precompilation.nodes[sinkNode.id].generationContext.signalIns[inletId] =
            variableNamesIndex.globs.nullSignal
    } else {
        // No need to declare ins if node has source as it should be precompiled
        // from source's connected out.
    }
}

export const precompileMessageOutlet = (
    compilation: Compilation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const {
        variableNamesIndex,
        precompilation,
        settings: { outletListenerSpecs },
    } = compilation
    const nodeOutletListenerSpecs = outletListenerSpecs[sourceNode.id] || []
    const precompiledNode = precompilation.nodes[sourceNode.id]
    const totalSinkCount = _getMessageOutletTotalSinkCount(
        compilation,
        sourceNode,
        outletId
    )

    // If there are several sinks, we then need to generate
    // a function to send messages to all sinks, e.g. :
    //
    //      const NODE1_SND = (m) => {
    //          NODE3_RCV(m)
    //          NODE2_RCV(m)
    //      }
    //
    if (totalSinkCount > 1) {
        const nodeOutletListeners = outletListenerSpecs[sourceNode.id] || []
        const hasOutletListener = nodeOutletListeners.includes(outletId)
        const messageSenderName = attachNodePortlet(
            compilation,
            'messageSenders',
            sourceNode.id,
            outletId
        )
        precompiledNode.generationContext.messageSenders[outletId] =
            messageSenderName
        precompiledNode.messageSenders[outletId] = {
            messageSenderName,
            messageReceiverNames: [
                ...outletSinks.map(
                    ({ nodeId: sinkNodeId, portletId: inletId }) =>
                        variableNamesIndex.nodes[sinkNodeId].messageReceivers[
                            inletId
                        ]
                ),
                ...(hasOutletListener
                    ? [
                          variableNamesIndex.outletListeners[sourceNode.id][
                              outletId
                          ],
                      ]
                    : []),
            ],
        }
    }

    // If no sink, no message receiver, we assign the node SND
    // a function that does nothing
    else if (totalSinkCount === 0) {
        precompiledNode.generationContext.messageSenders[outletId] =
            compilation.variableNamesIndex.globs.nullMessageReceiver
    }

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
    else if (
        outletSinks.length === 1 &&
        !nodeOutletListenerSpecs.includes(outletId)
    ) {
        precompiledNode.generationContext.messageSenders[outletId] =
            variableNamesIndex.nodes[outletSinks[0].nodeId].messageReceivers[
                outletSinks[0].portletId
            ]
    }

    // Same thing if there's no sink, but one outlet listener
    else if (
        outletSinks.length === 0 &&
        nodeOutletListenerSpecs.includes(outletId)
    ) {
        precompiledNode.generationContext.messageSenders[outletId] =
            variableNamesIndex.outletListeners[sourceNode.id][outletId]
    }
}

export const precompileMessageInlet = (
    compilation: Compilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const precompiledNode = compilation.precompilation.nodes[node.id]
    if (_getMessageInletTotalSourceCount(compilation, node, inletId) >= 1) {
        const messageReceiverName = attachNodePortlet(
            compilation,
            'messageReceivers',
            node.id,
            inletId
        )
        precompiledNode.generationContext.messageReceivers[inletId] =
            messageReceiverName

        // Add a placeholder message receiver that should be substituted when
        // compiling message receivers.
        precompiledNode.messageReceivers[inletId] = Func(
            messageReceiverName,
            [Var('Message', 'm')],
            'void'
        )`throw new Error("This placeholder should have been replaced during compilation")`
    } else {
        // If sourcesCount === 0, no need to declare message receiver
    }
}

export const precompileMessageReceivers = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, variableNamesIndex, nodeImplementations } =
        compilation
    const precompiledNode = precompilation.nodes[node.id]
    const { globs } = variableNamesIndex
    const { state, messageSenders: snds } = precompiledNode.generationContext
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        node.type
    )
    const messageReceivers = createNamespace(
        nodeNamespaceLabel(node, 'messageReceivers'),
        nodeImplementation.messageReceivers
            ? nodeImplementation.messageReceivers({
                  globs,
                  state,
                  snds,
                  node,
                  compilation,
              })
            : {}
    )

    Object.keys(precompiledNode.messageReceivers).forEach((inletId) => {
        const implementedFunc = messageReceivers[inletId]
        assertFuncSignatureEqual(implementedFunc, MESSAGE_RECEIVER_SIGNATURE)
        const targetFunc = precompiledNode.messageReceivers[inletId]

        // We can't override values in the namespace, so we need to copy
        // the function's properties one by one.
        targetFunc.name =
            variableNamesIndex.nodes[node.id].messageReceivers[inletId]
        targetFunc.args = implementedFunc.args
        targetFunc.body = implementedFunc.body
        targetFunc.returnType = implementedFunc.returnType
    })
}

export const precompileInitialization = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, nodeImplementations, variableNamesIndex } =
        compilation
    const { globs } = variableNamesIndex

    const precompiledNode = precompilation.nodes[node.id]
    const { state, messageSenders: snds } = precompiledNode.generationContext
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        node.type
    )
    precompiledNode.initialization = nodeImplementation.initialization
        ? nodeImplementation.initialization({
              globs,
              state,
              snds,
              node,
              compilation,
          })
        : ast``
}

export const precompileLoop = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, nodeImplementations, variableNamesIndex } =
        compilation
    const precompiledNode = precompilation.nodes[node.id]
    const { globs } = variableNamesIndex
    const {
        signalOuts: outs,
        signalIns: ins,
        messageSenders: snds,
        state,
    } = precompiledNode.generationContext
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        node.type
    )
    const baseContext = {
        globs,
        node,
        state,
        ins,
        compilation,
    }

    // Nodes that come here might have an inlinable loop, but still can't
    // be inlined because, for example, they have 2 sinks.
    if (nodeImplementation.inlineLoop) {
        const outletId = Object.keys(node.outlets)[0]
        precompiledNode.loop = ast`${
            variableNamesIndex.nodes[node.id].signalOuts[outletId]
        } = ${nodeImplementation.inlineLoop(baseContext)}`
    } else if (nodeImplementation.loop) {
        precompiledNode.loop = nodeImplementation.loop({
            ...baseContext,
            outs,
            snds,
        })
    } else {
        throw new Error(`No loop to generate for node ${node.type}:${node.id}`)
    }
}
/**
 * Inlines a subtree of inlinable nodes into a single string.
 * That string is then injected as signal input of the first non-inlinable sink.
 * e.g. :
 *
 * ```
 *          [  n1  ]      <-  inlinable subtree
 *               \          /
 *    [  n2  ]  [  n3  ]  <-
 *      \        /
 *       \      /
 *        \    /
 *       [  n4  ]  <- leaf node for the inlinable subtree
 *           |
 *       [  n5  ]  <- first non-inlinable sink
 *
 * ```
 */

export const precompileInlineLoop = (
    compilation: Compilation,
    leafNode: DspGraph.Node
) => {
    const {
        precompilation,
        variableNamesIndex,
        nodeImplementations,
        graph,
        target,
    } = compilation
    const { globs } = variableNamesIndex
    const inlineNodeTraversal = traversal.signalNodes(
        graph,
        [leafNode],
        (sourceNode) => isInlinableNode(compilation, sourceNode)
    )

    const inlinedNodes = inlineNodeTraversal.reduce<InlinedNodes>(
        (inlinedNodes, nodeId) => {
            const { signalIns: ins, state } =
                precompilation.nodes[nodeId].generationContext
            const node = getters.getNode(graph, nodeId)
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                node.type
            )

            const inlinedInputs: InlinedInputs = mapArray(
                // Select signal inlets with sources
                Object.values(node.inlets)
                    .map(
                        (inlet) =>
                            [inlet, getters.getSources(node, inlet.id)] as const
                    )
                    .filter(
                        ([inlet, sources]) =>
                            inlet.type === 'signal' &&
                            sources.length > 0 &&
                            // We filter out sources that are not inlinable.
                            // These sources will just be represented by their outlet's
                            // variable name.
                            inlineNodeTraversal.includes(sources[0].nodeId)
                    ),

                // Build map of inlined inputs
                ([inlet, sources]) => {
                    // Because it's a signal connection, we have only one source per inlet
                    const source = sources[0]
                    if (!(source.nodeId in inlinedNodes)) {
                        throw new Error(
                            `Unexpected error : inlining failed, missing inlined source ${source.nodeId}`
                        )
                    }
                    return [inlet.id, inlinedNodes[source.nodeId]]
                }
            )

            // TODO assemblyscript-upgrade : we need this because of a assemblyscript bug that seems
            // to be fixed in latest version. Remove when upgrading.
            // Bugs when a single variable name is surrounded with brackets : e.g. `(node1_OUTS_0)`
            // causes compilation error.
            const inlined = nodeImplementation.inlineLoop({
                globs,
                state,
                ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {
                    ...ins,
                    ...inlinedInputs,
                }),
                node,
                compilation,
            })
            const needsFix =
                inlined.content.length > 1 ||
                (typeof inlined.content[0] === 'string' &&
                    inlined.content[0].includes(' '))

            if (needsFix) {
                inlined.content.unshift('(')
                inlined.content.push(')')
            }
            // END TODO
            return {
                ...inlinedNodes,
                [nodeId]: render(getMacros(target), inlined),
            }
        },
        {}
    )

    const sink = getInlinableNodeSinkList(leafNode)[0]
    precompilation.nodes[sink.nodeId].generationContext.signalIns[
        sink.portletId
    ] = inlinedNodes[leafNode.id]
    return inlineNodeTraversal
}

export const isInlinableNode = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { nodeImplementations } = compilation
    const sinkList = getInlinableNodeSinkList(node)
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        node.type
    )
    return !!nodeImplementation.inlineLoop && sinkList.length === 1
}

/**
 * Inline node has only one outlet, but that outlet can be connected to
 * several sinks.
 */
export const getInlinableNodeSinkList = (
    node: DspGraph.Node
): Array<DspGraph.ConnectionEndpoint> => Object.values(node.sinks)[0] || []

const _getMessageInletTotalSourceCount = (
    compilation: Compilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const {
        settings: { inletCallerSpecs },
    } = compilation
    const nodeInletCallerSpecs = inletCallerSpecs[node.id] || []
    const inletSources = getters.getSources(node, inletId)
    return inletSources.length + +nodeInletCallerSpecs.includes(inletId)
}

const _getMessageOutletTotalSinkCount = (
    compilation: Compilation,
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const {
        settings: { outletListenerSpecs },
    } = compilation
    const nodeOutletListenerSpecs = outletListenerSpecs[node.id] || []
    const outletSinks = getters.getSinks(node, outletId)
    return outletSinks.length + +nodeOutletListenerSpecs.includes(outletId)
}
