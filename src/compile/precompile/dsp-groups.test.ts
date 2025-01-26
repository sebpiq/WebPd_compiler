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
import { makeGraph } from '../../test-helpers/graph-test-helpers'
import { NodeImplementations } from '../types'
import {
    _buildSingleFlowColdDspGroups,
    _isNodeDspInlinable,
    buildColdDspGroups,
    buildHotDspGroup,
    buildInlinableDspGroups,
    precompileColdDspGroup,
} from './dsp-groups'
import { DspGroup, PrecompiledCode } from './types'
import { ast } from '../../ast/declare'
import { makePrecompilation } from '../test-helpers'

describe('dsp-groups', () => {
    describe('precompileColdDspGroup', () => {
        const graph = makeGraph({
            n1: {},
            n2: {
                outlets: { '0': { type: 'signal', id: '0' } },
                sinks: { '0': [['n3', '0']] },
            },
            n3: {
                inlets: { '0': { type: 'signal', id: '0' } },
            },
        })

        const precompilation = makePrecompilation({ graph })

        precompileColdDspGroup(
            precompilation,
            {
                traversal: ['n1', 'n2'],
                outNodesIds: ['n2'],
            },
            '0'
        )

        assert.deepStrictEqual<PrecompiledCode['graph']['coldDspGroups']>(
            precompilation.precompiledCode.graph.coldDspGroups,
            {
                '0': {
                    dspGroup: {
                        traversal: ['n1', 'n2'],
                        outNodesIds: ['n2'],
                    },
                    sinkConnections: [
                        [
                            {
                                nodeId: 'n2',
                                portletId: '0',
                            },
                            {
                                nodeId: 'n3',
                                portletId: '0',
                            },
                        ],
                    ],
                    functionName: 'COLD_0',
                },
            }
        )
    })

    describe('_buildSingleFlowColdDspGroups', () => {
        it('should return a list of single-flow dsp groups', () => {
            //      [  n1  ]
            //         |
            //         |
            //      [  n2  ]   <- out node for group 1
            //         |
            //         |       [  n4  ]  <- out node for group 2
            //         |          |
            //      [  n3  ]   [  n5  ]
            const graph = makeGraph({
                // Group 1
                n1: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n2', '0']],
                    },
                },
                n2: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n3', '0']],
                    },
                },
                n3: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                // Group 2
                n4: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n5', '0']],
                    },
                },
                n5: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isPureFunction: true,
                    },
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual<Array<DspGroup>>(
                _buildSingleFlowColdDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3', 'n4', 'n5'],
                    outNodesIds: [],
                }),
                [
                    {
                        traversal: ['n1', 'n2'],
                        outNodesIds: ['n2'],
                    },
                    {
                        traversal: ['n4'],
                        outNodesIds: ['n4'],
                    },
                ]
            )
        })

        it('should handle nodes that are in several dsp groups', () => {
            //      [  n1  ]  <- this node is in group 1 and 2,
            //         |          and it is out node for group 1
            //         |\________
            //         |         |
            //         |       [  n4  ]
            //         |
            //      [  n2  ]  <- out node for group 2
            //         |
            //      [  n3  ]
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [
                            ['n2', '0'],
                            ['n4', '0'],
                        ],
                    },
                },
                n2: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n3', '0']],
                    },
                },
                n3: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isPureFunction: true,
                    },
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual<Array<DspGroup>>(
                _buildSingleFlowColdDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3', 'n4'],
                    outNodesIds: [],
                }),
                [
                    {
                        traversal: ['n1'],
                        outNodesIds: ['n1'],
                    },
                    {
                        traversal: ['n1', 'n2'],
                        outNodesIds: ['n2'],
                    },
                ]
            )
        })

        it('should not make groups with cold nodes that have hot sources', () => {
            //      [  n1  ]   <- hot dsp node
            //         |
            //         |
            //      [  n2  ]   <- cold dsp node
            //         |
            //         |
            //         |
            //      [  n3  ]
            const graph = makeGraph({
                n1: {
                    type: 'type2',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n2', '0']],
                    },
                },
                n2: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n3', '0']],
                    },
                },
                n3: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isPureFunction: true,
                    },
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual<Array<DspGroup>>(
                _buildSingleFlowColdDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3'],
                    outNodesIds: ['n3'],
                }),
                []
            )
        })
    })

    describe('buildColdDspGroups', () => {
        it('should return a list of dsp groups', () => {
            //      [  n1  ]                 [  n6  ] <- out node 1 for group 2
            //         |\________               |
            //         |         |           [  n7  ]
            //         |         |
            //         |       [  n4  ] <- out node 1 for group 1
            //         |         |
            //         |       [  n5  ]
            //         |
            //      [  n2  ]  <- out node 2 for group 1
            //         |
            //      [  n3  ]
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [
                            ['n2', '0'],
                            ['n4', '0'],
                        ],
                    },
                },
                n2: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n3', '0']],
                    },
                },
                n3: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                // Group 1 2nd branch
                n4: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n5', '0']],
                    },
                },
                n5: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                // Group 2
                n6: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n7', '0']],
                    },
                },
                n7: {
                    type: 'type2',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isPureFunction: true,
                    },
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual<Array<DspGroup>>(
                buildColdDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'],
                    outNodesIds: [],
                }),
                [
                    {
                        traversal: ['n1', 'n2', 'n4'],
                        outNodesIds: ['n2', 'n4'],
                    },
                    {
                        traversal: ['n6'],
                        outNodesIds: ['n6'],
                    },
                ]
            )
        })
    })

    describe('buildHotDspGroup', () => {
        it('should return the dsp group that contains nodes which are not in cold dsp groups', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n2', '0']],
                    },
                },
                n2: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        0: [['n3', '0']],
                    },
                },
                n3: {
                    isPullingSignal: true,
                    type: 'type2',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isPureFunction: true,
                    },
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual<DspGroup>(
                buildHotDspGroup(
                    precompilation,
                    {
                        traversal: ['n1', 'n2', 'n3'],
                        outNodesIds: ['n3'],
                    },
                    [
                        {
                            traversal: ['n1'],
                            outNodesIds: ['n1'],
                        },
                    ]
                ),
                {
                    traversal: ['n2', 'n3'],
                    outNodesIds: ['n3'],
                }
            )
        })
    })

    describe('buildInlinableDspGroups', () => {
        it('should return a list of inlinable dsp groups', () => {
            //
            //       [  n1  ]                               [  n6  ]  <- out node for group 2
            //            \                                    |
            // [  n2  ]  [  n3  ]                           [  n7  ]  <- non-inlinable node
            //   \        /
            //    \      /
            //     \    /
            //    [  n4  ]  <- out node for group 1
            //        |
            //    [  n5  ]  <- non-inlinable node
            const graph = makeGraph({
                // group 1
                n1: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [['n4', '1']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    type: 'inlinableType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        '0': [['n5', '0']],
                    },
                },
                n5: {
                    type: 'nonInlinableType',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                // group 2
                n6: {
                    type: 'inlinableType',
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: { '0': [['n7', '0']] },
                },
                n7: {
                    type: 'nonInlinableType',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: () => ast``,
                },
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual(
                buildInlinableDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'],
                    outNodesIds: ['n5', 'n7'],
                }),
                [
                    {
                        traversal: ['n2', 'n1', 'n3', 'n4'],
                        outNodesIds: ['n4'],
                    },
                    {
                        traversal: ['n6'],
                        outNodesIds: ['n6'],
                    },
                ]
            )
        })

        it('should exclude out nodes of the parent dsp group even if inlinable', () => {
            //
            //    [  n1  ]
            //       |
            //    [  n2  ]  <- out node for inlinable group
            //       |
            //    [  n3  ]  <- out node for parent group
            //
            const graph = makeGraph({
                n1: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [['n2', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    type: 'inlinableType',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: () => ast``,
                },
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.deepStrictEqual(
                buildInlinableDspGroups(precompilation, {
                    traversal: ['n1', 'n2', 'n3'],
                    outNodesIds: ['n3'],
                }),
                [
                    {
                        traversal: ['n1', 'n2'],
                        outNodesIds: ['n2'],
                    },
                ]
            )
        })
    })

    describe('_isNodeDspInlinable', () => {
        it('should return false if several signal connections between 2 nodes', () => {
            const graph = makeGraph({
                n1: {
                    type: 'inlinableType',
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n2', '1'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlinableType',
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: () => ast``,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.strictEqual(
                _isNodeDspInlinable(precompilation, graph.n1!),
                false
            )
        })
    })
})
