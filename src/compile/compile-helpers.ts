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
import { DspGraph, traversers } from '../dsp-graph'
import jsMacros from '../engine-javascript/compile/macros'
import ascMacros from '../engine-assemblyscript/compile/macros'
import {
    CompilerTarget,
    NodeImplementation,
    NodeImplementations,
} from './types'
import { CodeMacros } from './render/types'

/** Helper to get code macros from compile target. */
export const getMacros = (target: CompilerTarget): CodeMacros =>
    ({ javascript: jsMacros, assemblyscript: ascMacros }[target])

/** Helper to get node implementation or throw an error if not implemented. */
export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: DspGraph.NodeType
): NodeImplementation<DspGraph.NodeArguments> => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node [${nodeType}] is not implemented`)
    }
    return {
        dependencies: [],
        ...nodeImplementation,
    }
}

/**
 * Build graph traversal for all nodes.
 * This should be exhaustive so that all nodes that are connected
 * to an input or output of the graph are declared correctly.
 * Order of nodes doesn't matter.
 */
export const buildFullGraphTraversal = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )

    return Array.from(
        new Set([
            ...traversers.messageTraversal(graph, nodesPushingMessages),
            ...traversers.signalTraversal(graph, nodesPullingSignal),
        ])
    )
}

export const getNodeImplementationsUsedInGraph = (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations
) =>
    Object.values(graph).reduce<{
        [nodeType: DspGraph.NodeType]: NodeImplementation
    }>((nodeImplementationsUsedInGraph, node) => {
        if (node.type in nodeImplementationsUsedInGraph) {
            return nodeImplementationsUsedInGraph
        } else {
            return {
                ...nodeImplementationsUsedInGraph,
                [node.type]: getNodeImplementation(
                    nodeImplementations,
                    node.type
                ),
            }
        }
    }, {})

/**
 * Build graph traversal for all signal nodes.
 */
export const buildGraphTraversalSignal = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal =>
    traversers.signalTraversal(graph, getGraphSignalSinks(graph))

export const getGraphSignalSinks = (graph: DspGraph.Graph) =>
    Object.values(graph).filter((node) => !!node.isPullingSignal)