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

import { DspGraph, getters, traversal } from '../../dsp-graph'
import { mapObject } from '../../functional-helpers'
import { attachIoMessages } from '../variable-names-index'
import { buildGraphTraversalSignal } from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../namespace'
import { Compilation, Precompilation, VariableNamesIndex } from '../types'
import { Sequence, ast } from '../../ast/declare'
import precompileDependencies from './dependencies'
import {
    precompileSignalInlet,
    precompileMessageInlet,
    precompileSignalOutlet,
    precompileMessageOutlet,
    precompileInitialization,
    precompileMessageReceivers,
    precompileInlineLoop,
    precompileLoop,
    isInlinableNode,
    getInlinableNodeSinkList,
    precompileStateInitialization,
} from './nodes'

export default (compilation: Compilation) => {
    const { graph, precompilation } = compilation
    const nodes = traversal.toNodes(graph, precompilation.traversals.all)

    attachIoMessages(compilation)
    precompileDependencies(compilation)

    // Precompile node stateInitialization
    nodes.forEach((node) => {
        precompileStateInitialization(compilation, node)
    })

    // Go through the graph and precompile inlets.
    nodes.forEach((node) => {
        Object.values(node.inlets).forEach((inlet) => {
            if (inlet.type === 'signal') {
                precompileSignalInlet(compilation, node, inlet.id)
            } else if (inlet.type === 'message') {
                precompileMessageInlet(compilation, node, inlet.id)
            }
        })
    })

    // Go through the graph and precompile outlets.
    //
    // For example if a node has only one sink there is no need
    // to copy values between outlet and sink's inlet. Instead we can
    // collapse these two variables into one.
    //
    // We need to compile outlets after inlets because they reference
    // message receivers.
    nodes.forEach((node) => {
        Object.values(node.outlets).forEach((outlet) => {
            if (outlet.type === 'signal') {
                precompileSignalOutlet(compilation, node, outlet.id)
            } else if (outlet.type === 'message') {
                precompileMessageOutlet(compilation, node, outlet.id)
            }
        })
    })

    // This must come after we have assigned all node variables,
    nodes.forEach((node) => {
        precompileInitialization(compilation, node)
        precompileMessageReceivers(compilation, node)
    })

    const graphTraversalSignal = buildGraphTraversalSignal(graph)

    // First inline nodes that can be inlined.
    // Once inlined, these nodes don't have to be part of the loop traversal.
    traversal
        .toNodes(graph, graphTraversalSignal)
        .filter((node) => _isInlinableLeafNode(compilation, node))
        .forEach((node) => {
            const inlineNodeTraversal = precompileInlineLoop(compilation, node)
            inlineNodeTraversal.forEach((nodeId) => {
                graphTraversalSignal.splice(
                    graphTraversalSignal.indexOf(nodeId),
                    1
                )
            })
        })

    // Then deal with non-inlinable signal nodes.
    traversal.toNodes(graph, graphTraversalSignal).forEach((node) => {
        precompilation.traversals.loop.push(node.id)
        precompileLoop(compilation, node)
    })
}

export const initializePrecompilation = (
    graph: DspGraph.Graph,
    graphTraversalAll: DspGraph.GraphTraversal,
    variableNamesIndex: VariableNamesIndex
): Precompilation => ({
    nodes: createNamespace(
        'precompilation',
        mapObject(graph, (node) => ({
            generationContext: {
                messageReceivers: createNamespace(
                    nodeNamespaceLabel(
                        node,
                        'generationContext:messageReceivers'
                    ),
                    {}
                ),
                signalOuts: createNamespace(
                    nodeNamespaceLabel(node, 'generationContext:signalOuts'),
                    {}
                ),
                messageSenders: createNamespace(
                    nodeNamespaceLabel(
                        node,
                        'generationContext:messageSenders'
                    ),
                    {}
                ),
                signalIns: createNamespace(
                    nodeNamespaceLabel(node, 'generationContext:signalIns'),
                    {}
                ),
                state: variableNamesIndex.nodes[node.id].state,
            },
            messageReceivers: createNamespace(
                nodeNamespaceLabel(node, 'messageReceivers'),
                {}
            ),
            messageSenders: createNamespace(
                nodeNamespaceLabel(node, 'messageSenders'),
                {}
            ),
            signalOuts: createNamespace(
                nodeNamespaceLabel(node, 'signalOuts'),
                {}
            ),
            stateInitialization: null,
            initialization: ast``,
            loop: ast``,
        }))
    ),
    dependencies: {
        imports: [],
        exports: [],
        ast: Sequence([]),
    },
    traversals: {
        all: graphTraversalAll,
        loop: [],
    },
})

const _isInlinableLeafNode = (
    compilation: Compilation,
    node: DspGraph.Node
): boolean => {
    const { graph } = compilation
    const sink = getInlinableNodeSinkList(node)[0]
    if (!sink) {
        return false
    }
    const sinkNode = getters.getNode(graph, sink.nodeId)
    return (
        isInlinableNode(compilation, node) &&
        !isInlinableNode(compilation, sinkNode)
    )
}
