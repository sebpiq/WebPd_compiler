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

import assert from 'assert'
import { testGraphIntegrity, endpointsEqual } from './graph-helpers'
import { getNode } from './graph-getters'
import { listConnectionsIn } from './graph-traversal'
import { DspGraph } from './types'

type GraphConnection = [
    DspGraph.ConnectionEndpoint,
    DspGraph.ConnectionEndpoint
]

type ConciseConnectionEndpoint = [DspGraph.NodeId, DspGraph.PortletId]

export type ConciseGraphConnection = [
    DspGraph.NodeId,
    DspGraph.PortletId,
    DspGraph.NodeId,
    DspGraph.PortletId
]

type ConciseNode = {
    sinks?: { [outletId: string]: Array<ConciseConnectionEndpoint> }
    type?: DspGraph.NodeType
    args?: DspGraph.NodeArguments
    inlets?: DspGraph.PortletMap
    outlets?: DspGraph.PortletMap
    isPullingSignal?: true
    isPushingMessages?: true
}

type ConciseGraph = {
    [pdNodeId: string]: ConciseNode
}

export const nodeDefaults = (
    id: DspGraph.NodeId,
    type = 'DUMMY'
): DspGraph.Node => ({
    id,
    type,
    args: {},
    sources: {},
    sinks: {},
    inlets: {},
    outlets: {},
})

export const makeConnectionEndpoint = (
    conciseEndpoint: ConciseConnectionEndpoint
): DspGraph.ConnectionEndpoint => ({
    nodeId: conciseEndpoint[0],
    portletId: conciseEndpoint[1],
})

export const makeGraph = (conciseGraph: ConciseGraph): DspGraph.Graph => {
    const graph: DspGraph.Graph = {}
    Object.entries(conciseGraph).forEach(([nodeId, nodeParams]) => {
        graph[nodeId] = {
            ...nodeDefaults(nodeId),
            ...nodeParams,
            sources: {},
            sinks: {},
        }
    })

    Object.entries(conciseGraph).forEach(([sourceId, partialNode]) => {
        Object.entries(partialNode.sinks || {}).forEach(([outletId, sinks]) => {
            const sourceNode = getNode(graph, sourceId)
            sourceNode.sinks[outletId] = []
            sinks.forEach(([sinkId, inletId]) => {
                const sinkNode = getNode(graph, sinkId)
                sinkNode.sources[inletId] = sinkNode.sources[inletId] || []
                sourceNode.sinks[outletId]!.push(
                    makeConnectionEndpoint([sinkId, inletId])
                )
                sinkNode.sources[inletId]!.push(
                    makeConnectionEndpoint([sourceId, outletId])
                )
            })
        })
    })

    return graph
}

export const assertGraphsEqual = (
    actual: DspGraph.Graph,
    expected: RecursivePartial<DspGraph.Graph>,
    ignoreMissingKeys: boolean = false
): void => {
    assert.deepStrictEqual(
        Object.keys(actual).sort(),
        Object.keys(expected).sort(),
        'graphs should contain the same nodes'
    )
    Object.keys(actual).forEach((nodeId) => {
        assertNodesEqual(
            { ...getNode(actual, nodeId) },
            { id: nodeId, ...expected[nodeId] },
            ignoreMissingKeys
        )
    })
}

export const assertNodesEqual = (
    actual: DspGraph.Node,
    expected: RecursivePartial<DspGraph.Node>,
    ignoreMissingKeys: boolean
) => {
    let filteredActual: RecursivePartial<DspGraph.Node> = actual
    _uniformizeConnectionEndpoints((expected.sources as any) || {})
    _uniformizeConnectionEndpoints((filteredActual.sources as any) || {})
    _uniformizeConnectionEndpoints((expected.sinks as any) || {})
    _uniformizeConnectionEndpoints((filteredActual.sinks as any) || {})
    if (ignoreMissingKeys) {
        if (!expected.inlets) {
            delete (filteredActual as any).inlets
        }

        if (!expected.outlets) {
            delete (filteredActual as any).outlets
        }

        if (!expected.sinks) {
            delete (filteredActual as any).sinks
        }

        if (!expected.sources) {
            delete (filteredActual as any).sources
        }

        filteredActual = _pickKeys(filteredActual, expected)
    }
    assert.deepStrictEqual(filteredActual, expected)
}

export const assertGraphIntegrity = (graph: DspGraph.Graph): void => {
    const graphIntegrity = testGraphIntegrity(graph)
    assert.strictEqual(
        graphIntegrity,
        null,
        `graph integrity test failed : \n ${JSON.stringify(
            graphIntegrity,
            null,
            2
        )}`
    )
}

export const assertGraphConnections = (
    graph: DspGraph.Graph,
    conciseExpectedConnections: Array<ConciseGraphConnection>
): void => {
    const expectedConnections = conciseExpectedConnections.map(
        ([n1, p1, n2, p2]) => [
            makeConnectionEndpoint([n1!, p1!]),
            makeConnectionEndpoint([n2!, p2!]),
        ]
    ) as Array<GraphConnection>
    assertGraphIntegrity(graph)
    const actualConnections = Object.keys(graph).reduce(
        (connections, nodeId) => {
            const moreConnections = listConnectionsIn(
                getNode(graph, nodeId).sources,
                nodeId
            )
            return [...connections, ...moreConnections]
        },
        [] as Array<GraphConnection>
    )

    const _comparator = (
        [a1, a2]: GraphConnection,
        [b1, b2]: GraphConnection
    ): boolean => endpointsEqual(a1, b1) && endpointsEqual(a2, b2)

    const unexpectedConnections = _differenceWith(
        actualConnections,
        expectedConnections,
        _comparator
    )
    const missingConnections = _differenceWith(
        expectedConnections,
        actualConnections,
        _comparator
    )

    assert.ok(
        unexpectedConnections.length === 0,
        `Unexpected connections : ${JSON.stringify(
            unexpectedConnections,
            null,
            2
        )}`
    )
    assert.ok(
        missingConnections.length === 0,
        `Missing connections : ${JSON.stringify(missingConnections, null, 2)}`
    )
}

const _uniformizeConnectionEndpoints = (
    endpointMap: DspGraph.ConnectionEndpointMap
): void => {
    Object.entries(endpointMap).forEach(([portletId, endpoints]) => {
        // Remove empty endpoint lists
        if (endpoints.length === 0) {
            delete endpointMap[portletId]
        }
        // Sort the endpoints so they are in the same order for comparison
        endpoints.sort((a, b) => (a.nodeId > b.nodeId ? 1 : -1))
    })
}

const _differenceWith = <T>(
    array1: Array<T>,
    array2: Array<T>,
    comparator: (e1: T, e2: T) => boolean
) => array1.filter((e1) => !array2.some((e2) => comparator(e1, e2)))

const _pickKeys = <T>(obj: T, modelObj: Partial<T>): Partial<T> => {
    if (typeof obj === 'object' && !Array.isArray(obj) && obj !== null) {
        return Object.keys(modelObj).reduce<Partial<T>>(
            (partialObj, key) => ({
                ...partialObj,
                [key]: (obj as any)[key],
            }),
            {}
        )
    } else {
        return obj
    }
}

type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? RecursivePartial<U>[]
        : T[P] extends object
        ? RecursivePartial<T[P]>
        : T[P]
}
