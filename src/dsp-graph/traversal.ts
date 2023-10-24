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

import { mapArray } from '../functional-helpers'
import { getInlet, getNode, getOutlet } from './getters'
import { DspGraph } from './types'

type Connection = [DspGraph.ConnectionEndpoint, DspGraph.ConnectionEndpoint]

/**
 * Breadth first traversal for signal in the graph.
 * Traversal path is calculated by pulling incoming connections from
 * {@link nodesPullingSignal}.
 */
export const signalNodes = (
    graph: DspGraph.Graph,
    nodesPullingSignal: Array<DspGraph.Node>
): DspGraph.GraphTraversal => {
    const traversal: DspGraph.GraphTraversal = []
    nodesPullingSignal.forEach((node) =>
        _signalNodesBreadthFirstRecursive(traversal, [], graph, node)
    )
    return traversal
}

const _signalNodesBreadthFirstRecursive = (
    traversal: DspGraph.GraphTraversal,
    currentPath: DspGraph.GraphTraversal,
    graph: DspGraph.Graph,
    node: DspGraph.Node
) => {
    const nextPath: DspGraph.GraphTraversal = [...currentPath, node.id]
    Object.entries(node.sources)
        .filter(([inletId]) => getInlet(node, inletId).type === 'signal')
        .forEach(([_, sources]) => {
            sources.forEach((source) => {
                const sourceNode = getNode(graph, source.nodeId)
                if (currentPath.indexOf(sourceNode.id) !== -1) {
                    return
                }
                _signalNodesBreadthFirstRecursive(
                    traversal,
                    nextPath,
                    graph,
                    sourceNode
                )
            })
        })
    if (traversal.indexOf(node.id) === -1) {
        traversal.push(node.id)
    }
}

/**
 * Breadth first traversal for signal in the graph.
 * Traversal path is calculated by pulling incoming connections from
 * {@link nodesPushingMessages}.
 */
export const messageNodes = (
    graph: DspGraph.Graph,
    nodesPushingMessages: Array<DspGraph.Node>
) => {
    const traversal: DspGraph.GraphTraversal = []
    nodesPushingMessages.forEach((node) => {
        _messageNodesDepthFirstRecursive(traversal, graph, node)
    })
    return traversal
}

const _messageNodesDepthFirstRecursive = (
    traversal: DspGraph.GraphTraversal,
    graph: DspGraph.Graph,
    node: DspGraph.Node
) => {
    if (traversal.indexOf(node.id) !== -1) {
        return
    }
    traversal.push(node.id)
    Object.entries(node.sinks)
        .filter(([outletId]) => getOutlet(node, outletId).type === 'message')
        .forEach(([_, sinks]) => {
            sinks.forEach((sink) => {
                _messageNodesDepthFirstRecursive(
                    traversal,
                    graph,
                    getNode(graph, sink.nodeId)
                )
            })
        })
}

export const listConnectionsIn = (
    sources: DspGraph.ConnectionEndpointMap,
    nodeId: DspGraph.NodeId
): Array<Connection> => {
    return Object.entries(sources).reduce(
        (previousResults, [inletId, sources]) => {
            return [
                ...previousResults,
                ...sources.map(
                    (source) =>
                        [
                            source,
                            {
                                nodeId,
                                portletId: inletId,
                            },
                        ] as Connection
                ),
            ]
        },
        [] as Array<Connection>
    )
}

export const listConnectionsOut = (
    sinks: DspGraph.ConnectionEndpointMap,
    nodeId: DspGraph.NodeId
): Array<Connection> => {
    return Object.entries(sinks).reduce(
        (previousResults, [outletId, sinks]) => {
            return [
                ...previousResults,
                ...sinks.map(
                    (sink) =>
                        [
                            {
                                nodeId,
                                portletId: outletId,
                            },
                            sink,
                        ] as Connection
                ),
            ]
        },
        [] as Array<Connection>
    )
}

/**
 * Remove dead sinks and sources in graph.
 * @param graphTraversal contains all nodes that are connected to
 * an input or output of the graph.
 */
export const trimGraph = (
    graph: DspGraph.Graph,
    graphTraversal: DspGraph.GraphTraversal
): DspGraph.Graph => mapArray(
        Object.values(graph).filter((node) => graphTraversal.includes(node.id)), 
        (node) => [node.id, {
            ...node,
            sources: removeDeadSources(node.sources, graphTraversal),
            sinks: removeDeadSinks(node.sinks, graphTraversal),
        }]
    )

/**
 * When `node` has a sink node that is not connected to an end sink, that sink node won't be included
 * in the traversal, but will still appear in `node.sinks`.
 * Therefore, we need to make sure to filter `node.sinks` to exclude sink nodes that don't
 * appear in the traversal.
 */
export const removeDeadSinks = (
    sinks: DspGraph.ConnectionEndpointMap,
    graphTraversal: DspGraph.GraphTraversal
): DspGraph.ConnectionEndpointMap => {
    const filteredSinks: DspGraph.ConnectionEndpointMap = {}
    Object.entries(sinks).forEach(([outletId, outletSinks]) => {
        const filteredOutletSinks = outletSinks.filter(
            ({ nodeId: sinkNodeId }) => graphTraversal.includes(sinkNodeId)
        )
        if (filteredOutletSinks.length) {
            filteredSinks[outletId] = filteredOutletSinks
        }
    })
    return filteredSinks
}

/**
 * Filters a node's sources to exclude source nodes that don't
 * appear in the traversal.
 */
export const removeDeadSources = (
    sources: DspGraph.ConnectionEndpointMap,
    graphTraversal: DspGraph.GraphTraversal
): DspGraph.ConnectionEndpointMap => {
    const filteredSources: DspGraph.ConnectionEndpointMap = {}
    Object.entries(sources).forEach(([inletId, inletSources]) => {
        const filteredInletSources = inletSources.filter(
            ({ nodeId: sourceNodeId }) => graphTraversal.includes(sourceNodeId)
        )
        if (filteredInletSources.length) {
            filteredSources[inletId] = filteredInletSources
        }
    })
    return filteredSources
}
