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
    signalNodes,
    listConnectionsOut,
    listConnectionsIn,
    removeDeadSinks,
    removeDeadSources,
    trimGraph,
    messageNodes,
} from './traversers'
import { getNode } from './getters'
import { DspGraph } from './types'
import { makeGraph, nodeDefaults } from './test-helpers'

describe('graph-traversal', () => {
    describe('signalNodes', () => {
        it('traverses a graph with different levels in the right order', () => {
            // [  n1  ]
            //   |   \
            //   |  [  n2  ]
            //   |   /
            // [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n3', '0'],
                            ['n2', '1'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        '0': [['n3', '1']],
                    },
                    inlets: {
                        '1': { type: 'signal', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '1' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n2', 'n3'])
        })

        it('should respect stop condition when given', () => {
            // [  n1  ]
            //   |
            // [  n2  ]
            //   |    \
            //   |   [  n3  ]
            //   |        \
            // [  n4  ]  [  n5  ]
            //   \        /
            //    \      /
            //     \    /
            //    [  n6  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [['n2', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        '0': [['n4', '0']],
                        '1': [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
                n3: {
                    sinks: {
                        '0': [['n5', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    sinks: {
                        '0': [['n6', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n5: {
                    sinks: {
                        '0': [['n6', '1']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n6: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n6!], (node) =>
                !(['n1', 'n3'].includes(node.id))
            )
            assert.deepStrictEqual(traversal, ['n2', 'n4', 'n5', 'n6'])
        })

        it('traverses a graph with node with several sources', () => {
            //  [  n1  ] [  n2  ]
            //     |\   /
            //     | \/
            //     | /\
            //     |/  \
            //   [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [
                            ['n3', '0'],
                            ['n3', '1'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
                n2: {
                    sinks: {
                        0: [['n3', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n2', 'n3'])
        })

        it('should ignore node not connected to sink', () => {
            // [  n1  ]
            //   |   \
            //   | [  n2  ]
            //   |
            //   |
            // [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [
                            ['n3', '0'],
                            ['n2', '0'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n3'])
        })

        it('traverses the reversed graph with different levels in the right order', () => {
            //    [  n1  ]
            //     /    |
            // [  n2  ] |
            //     \    |
            //    [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [
                            ['n2', '0'],
                            ['n3', '1'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
                n2: {
                    sinks: {
                        0: [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n2', 'n3'])
        })

        it('traverses fine with a loop in the graph', () => {
            //           /\
            //    [  n1  ] |
            //     |       |
            //     |       |
            //     |       |
            //    [  n2  ] /
            //     |\_____/
            //     |
            //    [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [['n2', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        0: [
                            ['n1', '0'],
                            ['n3', '0'],
                        ],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n2', 'n3'])
        })

        it('ignores messages connections', () => {
            //  [  n1  ] [  n2  ]
            //     |     /
            //     |   /
            //     | /
            //    [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [['n3', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        0: [['n3', '1']],
                    },
                    outlets: {
                        '0': { type: 'message', id: '1' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
            })
            const traversal = signalNodes(graph, [graph.n3!])
            assert.deepStrictEqual(traversal, ['n1', 'n3'])
        })

        it('raises error if unknown source id', () => {
            const graph: DspGraph.Graph = {
                n1: nodeDefaults('n1'),
                n2: {
                    ...nodeDefaults('n2'),
                    sources: {
                        0: [{ nodeId: 'n_unknown', portletId: '0' }],
                    },
                },
            }
            assert.throws(() => signalNodes(graph, [graph.n2!]))
        })
    })

    describe('messageNodes', () => {
        it('traverses a graph with different levels in the right order', () => {
            // [  n1  ]
            //   |   \
            //   |  [  n2  ]
            //   |   /
            // [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [
                            ['n3', '0'],
                            ['n2', '1'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        0: [['n3', '1']],
                    },
                    inlets: {
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
            })
            const traversal = messageNodes(graph, [graph.n1!])
            assert.deepStrictEqual(traversal, ['n1', 'n3', 'n2'])
        })

        it('traverses fine with a loop in the graph', () => {
            //           /\
            //    [  n1  ] |
            //     |       |
            //     |       |
            //     |       |
            //    [  n2  ] /
            //     |\_____/
            //     |
            //    [  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        0: [['n2', '0']],
                    },
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n2: {
                    sinks: {
                        0: [
                            ['n1', '0'],
                            ['n3', '0'],
                        ],
                    },
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            const traversal = messageNodes(graph, [graph.n1!])
            assert.deepStrictEqual(traversal, ['n1', 'n2', 'n3'])
        })

        it('ignores signal connections', () => {
            //    [  n1  ]
            //     |   \
            //     |    \__
            //     |       \
            //   [  n2  ][  n3  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [['n2', '0']],
                        '1': [['n3', '0']],
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                        '1': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            const traversal = messageNodes(graph, [graph.n1!])
            assert.deepStrictEqual(traversal, ['n1', 'n2'])
        })
    })

    describe('listConnectionsIn', () => {
        it('should list all the sources', () => {
            const graph: DspGraph.Graph = makeGraph({
                n1: {},
                n2: {
                    sinks: {
                        '0': [
                            ['n1', '0'],
                            ['n1', '1'],
                        ],
                    },
                },
                n3: {
                    sinks: {
                        '1': [['n1', '2']],
                    },
                },
            })

            const results = listConnectionsIn(
                getNode(graph, 'n1').sources,
                'n1'
            )
            assert.deepStrictEqual(results, [
                [
                    { nodeId: 'n2', portletId: '0' },
                    { nodeId: 'n1', portletId: '0' },
                ],
                [
                    { nodeId: 'n2', portletId: '0' },
                    { nodeId: 'n1', portletId: '1' },
                ],
                [
                    { nodeId: 'n3', portletId: '1' },
                    { nodeId: 'n1', portletId: '2' },
                ],
            ])
        })
    })

    describe('listConnectionsOut', () => {
        it('should list all sinks', () => {
            const graph: DspGraph.Graph = makeGraph({
                n1: {},
                n2: {
                    sinks: {
                        '0': [
                            ['n1', '0'],
                            ['n1', '1'],
                        ],
                        '1': [['n3', '1']],
                    },
                },
                n3: {
                    sinks: {
                        '1': [['n2', '1']],
                    },
                },
            })

            const results = listConnectionsOut(getNode(graph, 'n2').sinks, 'n2')
            assert.deepStrictEqual(results, [
                [
                    { nodeId: 'n2', portletId: '0' },
                    { nodeId: 'n1', portletId: '0' },
                ],
                [
                    { nodeId: 'n2', portletId: '0' },
                    { nodeId: 'n1', portletId: '1' },
                ],
                [
                    { nodeId: 'n2', portletId: '1' },
                    { nodeId: 'n3', portletId: '1' },
                ],
            ])
        })
    })

    describe('trimGraph', () => {
        it('should remove graph nodes that are not in the traversal', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
                node3: {},
            })

            const trimmedGraph = trimGraph(graph, ['node1', 'node3'])
            assert.deepStrictEqual(
                Object.keys(trimmedGraph).sort(),
                ['node1', 'node3'].sort()
            )
        })

        it('should remove dead sinks from nodes', () => {
            const graph = makeGraph({
                node1: {
                    sinks: {
                        '0': [
                            ['node2', '0'],
                            ['node3', '0'],
                        ],
                    },
                },
                node2: {},
                node3: {},
            })

            const trimmedGraph = trimGraph(graph, ['node1', 'node2'])
            assert.deepStrictEqual(trimmedGraph.node1!.sinks, {
                '0': [{ nodeId: 'node2', portletId: '0' }],
            })
        })

        it('should remove dead sources from nodes', () => {
            const graph = makeGraph({
                node1: {
                    sinks: { '0': [['node3', '0']] },
                },
                node2: {
                    sinks: { '0': [['node3', '0']] },
                },
                node3: {},
            })

            const trimmedGraph = trimGraph(graph, ['node2', 'node3'])
            assert.deepStrictEqual(trimmedGraph.node3!.sources, {
                '0': [{ nodeId: 'node2', portletId: '0' }],
            })
        })
    })

    describe('removeDeadSinks', () => {
        it('should should remove sinks to nodes that are not in the traversal', () => {
            const graph: DspGraph.Graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n3', '0'],
                            ['n3', '1'],
                            ['n2', '0'], // Should be removed
                        ],
                        '1': [['n2', '0']], // Should be removed
                    },
                },
                n2: {
                    sinks: {
                        '1': [['n2', '1']],
                    },
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            const filteredSinks = removeDeadSinks(graph.n1!.sinks, ['n1', 'n3'])
            assert.deepStrictEqual(filteredSinks, {
                '0': [
                    { nodeId: 'n3', portletId: '0' },
                    { nodeId: 'n3', portletId: '1' },
                ],
            })
        })
    })

    describe('removeDeadSources', () => {
        it('should should remove sources from nodes that are not in the traversal', () => {
            const graph: DspGraph.Graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [['n3', '0']], // Should be removed
                        '1': [['n2', '0']], // Should be removed
                    },
                },
                n2: {
                    sinks: {
                        '1': [['n3', '1']],
                    },
                },
                n3: {
                    isPullingSignal: true,
                },
            })

            let filteredSources = removeDeadSources(graph.n2!.sources, [
                'n2',
                'n3',
            ])
            assert.deepStrictEqual(filteredSources, {})

            filteredSources = removeDeadSources(graph.n3!.sources, ['n2', 'n3'])
            assert.deepStrictEqual(filteredSources, {
                '1': [{ nodeId: 'n2', portletId: '1' }],
            })
        })
    })
})
