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
import {
    signalNodes,
    listConnectionsOut,
    listConnectionsIn,
    removeDeadSinks,
    messageNodes,
    removeDeadSources,
    trimGraph,
} from './graph-traversal'
import { getNode } from './graph-getters'
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

            trimGraph(graph, ['node1', 'node3'])
            assert.deepStrictEqual(
                Object.keys(graph).sort(),
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

            trimGraph(graph, ['node1', 'node2'])
            assert.deepStrictEqual(graph.node1!.sinks, {
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

            trimGraph(graph, ['node2', 'node3'])
            assert.deepStrictEqual(graph.node3!.sources, {
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
