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
import {
    getNode,
    getSources,
    getSinks,
    getOutlet,
    getInlet,
} from './graph-getters'
import { endpointsEqual } from './graph-helpers'
import { DspGraph } from './types'

export const addNode = (
    graph: DspGraph.Graph,
    node: DspGraph.Node
): DspGraph.Node => {
    if (!graph[node.id]) {
        graph[node.id] = node
    }
    return graph[node.id]!
}

export const connect = (
    graph: DspGraph.Graph,
    source: DspGraph.ConnectionEndpoint,
    sink: DspGraph.ConnectionEndpoint
): void => {
    const sinkNode = getNode(graph, sink.nodeId)
    const sourceNode = getNode(graph, source.nodeId)
    const otherSources = getSources(sinkNode, sink.portletId)
    const otherSinks = getSinks(sourceNode, source.portletId)
    const outlet = getOutlet(sourceNode, source.portletId)
    const inlet = getInlet(sinkNode, sink.portletId)

    // Avoid duplicate connections : we check only on sinks,
    // because we assume that connections are always consistent on both sides.
    if (otherSinks.some((otherSink) => endpointsEqual(sink, otherSink))) {
        return
    }

    // Check that connection is valid
    if (!outlet) {
        throw new Error(`Undefined outlet ${source.nodeId}:${source.portletId}`)
    }
    if (!inlet) {
        throw new Error(`Undefined inlet ${sink.nodeId}:${sink.portletId}`)
    }
    if (outlet.type !== inlet.type) {
        throw new Error(
            `Incompatible portlets types ${source.nodeId} | ${source.portletId} (${outlet.type}) -> ${sink.nodeId} | ${sink.portletId} (${inlet.type})`
        )
    }
    if (inlet.type === 'signal' && otherSources.length) {
        throw new Error(`Signal inlets can have only one connection`)
    }

    _ensureConnectionEndpointArray(sinkNode.sources, sink.portletId).push(
        source
    )
    _ensureConnectionEndpointArray(sourceNode.sinks, source.portletId).push(
        sink
    )
}

/** If it exists, remove single connection from `sourceNodeId` to `sinkNodeId`. */
export const disconnect = (
    graph: DspGraph.Graph,
    source: DspGraph.ConnectionEndpoint,
    sink: DspGraph.ConnectionEndpoint
): void => {
    const sinkNode = getNode(graph, sink.nodeId)
    const sourceNode = getNode(graph, source.nodeId)

    const sinks = getSinks(sourceNode, source.portletId)
    sourceNode.sinks[source.portletId] = sinks.filter(
        (otherSink) => !endpointsEqual(sink, otherSink)
    )

    const sources = getSources(sinkNode, sink.portletId)
    sinkNode.sources[sink.portletId] = sources.filter(
        (otherSource) => !endpointsEqual(source, otherSource)
    )
}

/** Remove all existing connections from `sourceNodeId` to `sinkNodeId`. */
export const disconnectNodes = (
    graph: DspGraph.Graph,
    sourceNodeId: DspGraph.NodeId,
    sinkNodeId: DspGraph.NodeId
): void => {
    const sourceNode = getNode(graph, sourceNodeId)
    const sinkNode = getNode(graph, sinkNodeId)
    Object.entries(sinkNode.sources).forEach(
        ([inletId, sources]) =>
            (sinkNode.sources[inletId] = sources.filter(
                (source) => source.nodeId !== sourceNodeId
            ))
    )
    Object.entries(sourceNode.sinks).forEach(
        ([outletId, sinks]) =>
            (sourceNode.sinks[outletId] = sinks.filter(
                (sink) => sink.nodeId !== sinkNodeId
            ))
    )
}

/** Delete node from the graph, also cleaning all the connections from and to other nodes. */
export const deleteNode = (
    graph: DspGraph.Graph,
    nodeId: DspGraph.NodeId
): void => {
    const node = graph[nodeId]
    if (!node) {
        return
    }

    // `slice(0)` because array might change during iteration
    Object.values(node.sources).forEach((sources) =>
        sources
            .slice(0)
            .forEach((source) => disconnectNodes(graph, source.nodeId, nodeId))
    )
    Object.values(node.sinks).forEach((sinks) =>
        sinks
            .slice(0)
            .forEach((sink) => disconnectNodes(graph, nodeId, sink.nodeId))
    )

    delete graph[nodeId]
}

const _ensureConnectionEndpointArray = (
    portletMap: DspGraph.ConnectionEndpointMap,
    portletId: DspGraph.PortletId
): Array<DspGraph.ConnectionEndpoint> =>
    (portletMap[portletId] = portletMap[portletId] || [])
