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

import { getNode, getSinks, getSources } from './graph-getters'
import { listConnectionsOut, listConnectionsIn } from './graph-traversal'
import { DspGraph } from './types'

type Connection = [DspGraph.ConnectionEndpoint, DspGraph.ConnectionEndpoint]

export const endpointsEqual = (
    a1: DspGraph.ConnectionEndpoint,
    a2: DspGraph.ConnectionEndpoint
): boolean => a1.portletId === a2.portletId && a1.nodeId === a2.nodeId

export const testGraphIntegrity = (
    graph: DspGraph.Graph
): { inconsistentConnections: Array<Connection> } | null => {
    const inconsistentConnections: Array<Connection> = []

    Object.keys(graph).forEach((nodeId) => {
        const node = getNode(graph, nodeId)
        // For each source, we check that the corresponding node declares the equivalent sink
        listConnectionsIn(node.sources, nodeId).forEach(([source, sink]) => {
            const sourceNode = getNode(graph, source.nodeId)
            const sinks = getSinks(sourceNode, source.portletId)
            const matchedSink = sinks.filter((otherSink) =>
                endpointsEqual(otherSink, sink)
            )[0]
            if (!matchedSink) {
                inconsistentConnections.push([source, sink])
            }
        })

        // For each sink, we check that the corresponding node declares the equivalent source
        listConnectionsOut(node.sinks, nodeId).forEach(([source, sink]) => {
            const sinkNode = getNode(graph, sink.nodeId)
            const matchedSource = getSources(sinkNode, sink.portletId)
            if (!matchedSource) {
                inconsistentConnections.push([source, sink])
            }
        })
    })

    if (inconsistentConnections.length) {
        return { inconsistentConnections }
    }
    return null
}
