/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { getInlet, getNode, getOutlet } from './graph-getters'
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
 */
export const trimGraph = (
    graph: DspGraph.Graph,
    graphTraversal: DspGraph.GraphTraversal
) => {
    Object.entries(graph).forEach(([nodeId, node]) => {
        if (!graphTraversal.includes(nodeId)) {
            delete graph[nodeId]
        } else {
            graph[nodeId] = {
                ...node,
                sources: removeDeadSources(node.sources, graphTraversal),
                sinks: removeDeadSinks(node.sinks, graphTraversal),
            }
        }
    })
}

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
