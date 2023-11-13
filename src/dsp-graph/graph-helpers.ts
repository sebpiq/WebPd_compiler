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

import { getNode, getSinks, getSources } from './getters'
import { listConnectionsOut, listConnectionsIn } from './traversal'
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
