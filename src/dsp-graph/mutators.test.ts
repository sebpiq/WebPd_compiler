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

import assert from 'assert'
import {
    addNode,
    connect,
    disconnectNodes,
    deleteNode,
    disconnect,
} from './mutators'
import { assertGraphConnections, makeGraph, nodeDefaults } from './test-helpers'
import { DspGraph } from './types'

describe('mutators', () => {
    describe('addNode', () => {
        it("should add the node to the graph if it isn't yet", () => {
            const graph: DspGraph.Graph = {}
            addNode(graph, {
                id: '1',
                type: 'osc~',
                args: { freq: 440 },
                inlets: { '0': { type: 'message', id: '0' } },
                outlets: { '0': { type: 'signal', id: '0' } },
                sources: {},
                sinks: {},
            })
            assert.deepStrictEqual(graph, {
                '1': {
                    id: '1',
                    type: 'osc~',
                    sources: {},
                    sinks: {},
                    args: { freq: 440 },
                    inlets: { '0': { type: 'message', id: '0' } },
                    outlets: { '0': { type: 'signal', id: '0' } },
                },
            })
        })

        it('should throw an error if node already exists', () => {
            const graph: DspGraph.Graph = {
                '1': nodeDefaults('1', 'osc~'),
            }
            assert.throws(() =>
                addNode(graph, {
                    id: '1',
                    type: 'phasor~',
                    args: { freq: 440 },
                    inlets: { '0': { type: 'message', id: '0' } },
                    outlets: { '0': { type: 'signal', id: '0' } },
                    sources: {},
                    sinks: {},
                })
            )
        })
    })

    describe('connect', () => {
        it('should connect nodes that are not yet connected', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
                '1': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
            })
            assertGraphConnections(graph, [])

            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '0' }
            )
            assertGraphConnections(graph, [['0', '0', '1', '0']])

            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '1' }
            )
            assertGraphConnections(graph, [
                ['0', '0', '1', '0'],
                ['0', '0', '1', '1'],
            ])
        })

        it('should not add a connection if it already exists', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: { '10': { type: 'message', id: '10' } },
                },
                '1': {
                    inlets: { '20': { type: 'message', id: '20' } },
                },
            })

            connect(
                graph,
                { nodeId: '0', portletId: '10' },
                { nodeId: '1', portletId: '20' }
            )
            assertGraphConnections(graph, [['0', '10', '1', '20']])

            connect(
                graph,
                { nodeId: '0', portletId: '10' },
                { nodeId: '1', portletId: '20' }
            )
            assertGraphConnections(graph, [['0', '10', '1', '20']])
            // Check that not added twice
            assert.deepStrictEqual(graph['0']!.sinks, {
                10: [{ nodeId: '1', portletId: '20' }],
            })
            assert.deepStrictEqual(graph['1']!.sources, {
                20: [{ nodeId: '0', portletId: '10' }],
            })
        })

        it('should not throw an error if signal connection already exists', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                '1': {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '0' }
            )
            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '0' }
            )
            assertGraphConnections(graph, [['0', '0', '1', '0']])
        })

        it('should throw an error if unknown outlet', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {},
                },
                '1': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            assert.throws(
                () =>
                    connect(
                        graph,
                        { nodeId: '0', portletId: '0' },
                        { nodeId: '1', portletId: '0' }
                    ),
                Error
            )
        })

        it('should throw an error if unknown inlet', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                '1': {
                    inlets: {},
                },
            })
            assert.throws(
                () =>
                    connect(
                        graph,
                        { nodeId: '0', portletId: '0' },
                        { nodeId: '1', portletId: '0' }
                    ),
                Error
            )
        })

        it('should throw an error if portlet types are incompatible', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                '1': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            assert.throws(
                () =>
                    connect(
                        graph,
                        { nodeId: '0', portletId: '0' },
                        { nodeId: '1', portletId: '0' }
                    ),
                Error
            )
        })

        it('should throw an error if signal inlet already has a connection', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                '1': {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                '2': {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '0' }
            )

            assert.throws(
                () =>
                    connect(
                        graph,
                        { nodeId: '2', portletId: '0' },
                        { nodeId: '1', portletId: '0' }
                    ),
                Error
            )
        })
    })

    describe('disconnect', () => {
        it('should disconnect nodes that are connected', () => {
            const graph: DspGraph.Graph = makeGraph({
                n0: {
                    sinks: {
                        10: [
                            ['n1', '21'],
                            ['n2', '22'],
                        ],
                        11: [['n1', '23']],
                    },
                    outlets: {
                        10: { id: '10', type: 'message' },
                        11: { id: '11', type: 'message' },
                    }
                },
                n1: {
                    inlets: {
                        21: { id: '21', type: 'message' },
                        23: { id: '23', type: 'message' },
                    }
                },
                n2: {
                    inlets: {
                        22: { id: '22', type: 'message' },
                    }
                },
            })
            assertGraphConnections(graph, [
                ['n0', '10', 'n1', '21'],
                ['n0', '10', 'n2', '22'],
                ['n0', '11', 'n1', '23'],
            ])

            disconnect(
                graph,
                { nodeId: 'n0', portletId: '10' },
                { nodeId: 'n2', portletId: '22' }
            )
            assertGraphConnections(graph, [
                ['n0', '10', 'n1', '21'],
                ['n0', '11', 'n1', '23'],
            ])

            disconnect(
                graph,
                { nodeId: 'n0', portletId: '11' },
                { nodeId: 'n1', portletId: '23' }
            )
            assertGraphConnections(graph, [['n0', '10', 'n1', '21']])
        })

        it('should do nothing if connection doesnt exist', () => {
            const graph: DspGraph.Graph = makeGraph({
                n0: {
                    sinks: {
                        0: [['n1', '1']],
                    },
                    outlets: {
                        0: { id: '0', type: 'message' },
                        1: { id: '1', type: 'message' },
                    }
                },
                n1: {
                    inlets: {
                        1: { id: '1', type: 'message' },
                    }
                },
            })

            disconnect(
                graph,
                { nodeId: 'n0', portletId: '1' },
                { nodeId: 'n1', portletId: '1' }
            )

            assertGraphConnections(graph, [['n0', '0', 'n1', '1']])
        })

        it('shouldnt remove other incoming connections to same port', () => {
            const graph: DspGraph.Graph = makeGraph({
                n0: {
                    sinks: {
                        0: [['n2', '0']],
                    },
                    outlets: {
                        0: { id: '0', type: 'message' },
                    }
                },
                n1: {
                    sinks: {
                        0: [['n2', '0']],
                    },
                    outlets: {
                        0: { id: '0', type: 'message' },
                    }
                },
                n2: {
                    inlets: {
                        0: { id: '0', type: 'message' },
                    }
                },
            })

            disconnect(
                graph,
                { nodeId: 'n0', portletId: '0' },
                { nodeId: 'n2', portletId: '0' }
            )
            assertGraphConnections(graph, [['n1', '0', 'n2', '0']])
        })
    })

    describe('disconnectNodes', () => {
        it('should disconnect all endpoints from nodes', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
                '1': {
                    outlets: { '0': { type: 'message', id: '0' } },
                },
                '2': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                        '2': { type: 'message', id: '2' },
                    },
                },
            })

            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '2', portletId: '0' }
            )
            connect(
                graph,
                { nodeId: '0', portletId: '1' },
                { nodeId: '2', portletId: '1' }
            )
            connect(
                graph,
                { nodeId: '1', portletId: '0' },
                { nodeId: '2', portletId: '2' }
            )
            assertGraphConnections(graph, [
                ['0', '0', '2', '0'],
                ['0', '1', '2', '1'],
                ['1', '0', '2', '2'],
            ])

            disconnectNodes(graph, '0', '2')
            assertGraphConnections(graph, [['1', '0', '2', '2']])
        })
    })

    describe('deleteNode', () => {
        it('should remove all connections, and delete node from graph', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': {
                    outlets: { '0': { type: 'message', id: '0' } },
                },
                '1': {
                    outlets: { '0': { type: 'message', id: '0' } },
                },
                '2': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
            })

            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '2', portletId: '0' }
            )
            connect(
                graph,
                { nodeId: '1', portletId: '0' },
                { nodeId: '2', portletId: '1' }
            )
            assertGraphConnections(graph, [
                ['0', '0', '2', '0'],
                ['1', '0', '2', '1'],
            ])

            deleteNode(graph, '1')
            assert.deepStrictEqual(Object.keys(graph), ['0', '2'])
            assertGraphConnections(graph, [['0', '0', '2', '0']])
        })

        it('should work fine when several sinks', () => {
            const graph: DspGraph.Graph = makeGraph({
                '0': { outlets: { '0': { type: 'message', id: '0' } } },
                '1': { inlets: { '0': { type: 'message', id: '0' } } },
                '2': {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
            })

            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '1', portletId: '0' }
            )
            connect(
                graph,
                { nodeId: '0', portletId: '0' },
                { nodeId: '2', portletId: '1' }
            )
            assertGraphConnections(graph, [
                ['0', '0', '1', '0'],
                ['0', '0', '2', '1'],
            ])

            deleteNode(graph, '0')
            assert.deepStrictEqual(Object.keys(graph), ['1', '2'])
            assertGraphConnections(graph, [])
        })
    })
})
