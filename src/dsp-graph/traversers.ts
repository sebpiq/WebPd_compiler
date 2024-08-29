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

/**
 * Simple helper to get a list of nodes from a traversal (which is simply node ids).
 */
export const toNodes = (
    graph: DspGraph.Graph,
    traversal: DspGraph.GraphTraversal
) => traversal.map<DspGraph.Node>((nodeId) => getNode(graph, nodeId))

export const listSinkNodes = (
    graph: DspGraph.Graph,
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
) => _listSourceOrSinkNodes(node.sinks, getOutlet, graph, node, portletType)

export const listSourceNodes = (
    graph: DspGraph.Graph,
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
) => _listSourceOrSinkNodes(node.sources, getInlet, graph, node, portletType)

export const listSourceConnections = (
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
): Array<DspGraph.Connection> =>
    // We need to reverse the order of the connection, because `_listSourcesOrSinks`
    // puts the calling node's endpoint first regardless of whether we're listing sources or sinks.
    _listSourcesOrSinks(node.sources, getInlet, node, portletType).map(
        ([sink, source]) => [source, sink]
    )

export const listSinkConnections = (
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
): Array<DspGraph.Connection> =>
    _listSourcesOrSinks(node.sinks, getOutlet, node, portletType)

const _listSourcesOrSinks = (
    sourcesOrSinks: DspGraph.ConnectionEndpointMap,
    portletGetter: typeof getInlet | typeof getOutlet,
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
): Array<DspGraph.Connection> =>
    // We always put the `node` endpoint first, even if we're listing connections to sources,
    // this allows mre genericity to the function
    Object.entries(sourcesOrSinks).reduce<Array<DspGraph.Connection>>(
        (connections, [portletId, sourceOrSinkList]) => {
            const nodeEndpoint = { portletId, nodeId: node.id }
            const portlet = portletGetter(node, portletId)
            if (portlet.type === portletType || portletType === undefined) {
                return [
                    ...connections,
                    ...sourceOrSinkList.map(
                        (s) => [nodeEndpoint, s] as DspGraph.Connection
                    ),
                ]
            } else {
                return connections
            }
        },
        []
    )

const _listSourceOrSinkNodes = (
    sourcesOrSinks: DspGraph.ConnectionEndpointMap,
    portletGetter: typeof getInlet | typeof getOutlet,
    graph: DspGraph.Graph,
    node: DspGraph.Node,
    portletType?: DspGraph.PortletType
): Array<DspGraph.Node> =>
    _listSourcesOrSinks(sourcesOrSinks, portletGetter, node, portletType)
        .reduce<Array<DspGraph.NodeId>>(
            (sourceOrSinkNodeIds, [_, sourceOrSink]) => {
                if (!sourceOrSinkNodeIds.includes(sourceOrSink.nodeId)) {
                    return [...sourceOrSinkNodeIds, sourceOrSink.nodeId]
                } else {
                    return sourceOrSinkNodeIds
                }
            },
            []
        )
        .map((nodeId) => getNode(graph, nodeId))

/**
 * Breadth first traversal for signal in the graph.
 * Traversal path is calculated by pulling incoming connections from
 * {@link nodesPullingSignal}.
 */
export const signalTraversal = (
    graph: DspGraph.Graph,
    nodesPullingSignal: Array<DspGraph.Node>,
    shouldContinue?: (node: DspGraph.Node) => boolean
): DspGraph.GraphTraversal => {
    const traversal: DspGraph.GraphTraversal = []
    nodesPullingSignal.forEach((node) =>
        _signalTraversalBreadthFirstRecursive(
            traversal,
            [],
            graph,
            node,
            shouldContinue
        )
    )
    return traversal
}

const _signalTraversalBreadthFirstRecursive = (
    traversal: DspGraph.GraphTraversal,
    currentPath: DspGraph.GraphTraversal,
    graph: DspGraph.Graph,
    node: DspGraph.Node,
    shouldContinue?: (node: DspGraph.Node) => boolean
) => {
    if (shouldContinue && !shouldContinue(node)) {
        return
    }
    const nextPath: DspGraph.GraphTraversal = [...currentPath, node.id]
    listSourceNodes(graph, node, 'signal').forEach((sourceNode) => {
        if (currentPath.indexOf(sourceNode.id) !== -1) {
            return
        }
        _signalTraversalBreadthFirstRecursive(
            traversal,
            nextPath,
            graph,
            sourceNode,
            shouldContinue
        )
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
export const messageTraversal = (
    graph: DspGraph.Graph,
    nodesPushingMessages: Array<DspGraph.Node>
): DspGraph.GraphTraversal => {
    const traversal: DspGraph.GraphTraversal = []
    nodesPushingMessages.forEach((node) => {
        _messageTraversalDepthFirstRecursive(traversal, graph, node)
    })
    return traversal
}

const _messageTraversalDepthFirstRecursive = (
    traversal: DspGraph.GraphTraversal,
    graph: DspGraph.Graph,
    node: DspGraph.Node
) => {
    if (traversal.indexOf(node.id) !== -1) {
        return
    }
    traversal.push(node.id)
    listSinkNodes(graph, node, 'message').forEach((sinkNode) => {
        _messageTraversalDepthFirstRecursive(traversal, graph, sinkNode)
    })
}

/**
 * Remove dead sinks and sources in graph.
 * @param graphTraversal contains all nodes that are connected to
 * an input or output of the graph.
 */
export const trimGraph = (
    graph: DspGraph.Graph,
    graphTraversal: DspGraph.GraphTraversal
): DspGraph.Graph =>
    mapArray(
        Object.values(graph).filter((node) => graphTraversal.includes(node.id)),
        (node) => [
            node.id,
            {
                ...node,
                sources: removeDeadSources(node.sources, graphTraversal),
                sinks: removeDeadSinks(node.sinks, graphTraversal),
            },
        ]
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
