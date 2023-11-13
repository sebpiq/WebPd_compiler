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
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation } from '../test-helpers'
import precompile from './precompile'
import { NodeImplementations } from './types'
import { ast } from '../ast/declare'

describe('precompile', () => {
    describe('signal INS/OUTS', () => {
        it('should substitute connected signal IN with its source OUT for non-inline nodes', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                    sinks: {
                        '0': [['node2', '0']],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                DUMMY: {
                    // generateLoop signals that node is non-inline
                    generateLoop: () => ast``,
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
                graphTraversalDeclare: ['node1', 'node2'],
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.outs['0'],
                'node1_OUTS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node2.ins['0'],
                'node1_OUTS_0'
            )
        })

        it('should put empty signal for unconnected IN', () => {
            const graph = makeGraph({
                node1: {
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1'],
            })

            precompile(compilation)

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.ins['0'],
                compilation.variableNamesIndex.globs.nullSignal
            )
        })
    })

    describe('message SNDS', () => {
        it('should create SND if several sinks', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['node2', '0'],
                            ['node3', '0'],
                        ],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                node3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1', 'node2', 'node3'],
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.snds['0'],
                'node1_SNDS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.snds['0'],
                'node1_SNDS_0'
            )
        })

        it("should substitute message SND with the sink's RCV if only one sink", () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [['node2', '0']],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1', 'node2'],
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node2.rcvs['0'],
                'node2_RCVS_0'
            )
            assert.ok(!('0' in compilation.variableNamesIndex.nodes.node1.snds))

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.snds['0'],
                'node2_RCVS_0'
            )
        })

        it('should NOT substitute message SND if an outlet listener is also specified', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [['node2', '0']],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1', 'node2'],
                outletListenerSpecs: {
                    node1: ['0'],
                },
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.snds['0'],
                'node1_SNDS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.snds['0'],
                'node1_SNDS_0'
            )
        })

        it('should substitute SND with outlet listener if no sinks', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1'],
                outletListenerSpecs: {
                    node1: ['0'],
                },
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.outletListeners.node1['0'],
                'outletListeners_node1_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.snds['0'],
                compilation.variableNamesIndex.outletListeners.node1['0']
            )
        })

        it('should substitute SND with null function if no sink and not outlet listener', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1'],
            })

            precompile(compilation)

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.snds['0'],
                compilation.variableNamesIndex.globs.nullMessageReceiver
            )
        })
    })

    describe('message RCVS', () => {
        it('should declare message inlet when it has one or more sources', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                        '1': { id: '1', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['node2', '0'],
                            ['node3', '0'],
                        ],
                        '1': [['node2', '0']],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                node3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1', 'node2', 'node3'],
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node2.rcvs['0'],
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node3.rcvs['0'],
                'node3_RCVS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node2.rcvs['0'],
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.precompilation.node3.rcvs['0'],
                'node3_RCVS_0'
            )
        })

        it('should declare message inlet when outlet has several sinks', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['node2', '0'],
                            ['node3', '0'],
                        ],
                    },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                node3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1', 'node2', 'node3'],
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node2.rcvs['0'],
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node3.rcvs['0'],
                'node3_RCVS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node2.rcvs['0'],
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.precompilation.node3.rcvs['0'],
                'node3_RCVS_0'
            )
        })

        it('should remove message inlets when inlet has no source', () => {
            const graph = makeGraph({
                node1: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1'],
            })

            precompile(compilation)

            // Variable declarations
            assert.ok(!('0' in compilation.variableNamesIndex.nodes.node1.rcvs))
        })

        it('should keep message inlet when inlet caller is declared', () => {
            const graph = makeGraph({
                node1: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                graphTraversalDeclare: ['node1'],
                inletCallerSpecs: { node1: ['0'] },
            })

            precompile(compilation)

            // Variable declarations
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.rcvs['0'],
                'node1_RCVS_0'
            )

            // Precompilation
            assert.strictEqual(
                compilation.precompilation.node1.rcvs['0'],
                'node1_RCVS_0'
            )
        })
    })

    describe('inline nodes', () => {
        it('should precompile the inline loop code', () => {
            //       [  nonInline1  ]
            //         |
            //       [  n1  ]
            //            \
            // [  n2  ]  [  n3  ]
            //   \        /
            //    \      /
            //     \    /
            //    [  n4  ]
            //       |
            //    [  nonInline2  ]
            const graph = makeGraph({
                nonInline1: {
                    type: 'signalType',
                    sinks: {
                        '0': [['n1', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n1: {
                    type: 'inlineType1',
                    args: { value: 'N1' },
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
                    type: 'inlineType0',
                    args: { value: 'N2' },
                    sinks: {
                        '0': [['n4', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    type: 'inlineType1',
                    args: { value: 'N3' },
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
                    type: 'inlineType2',
                    args: { value: 'N4' },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'signal', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        '0': [['nonInline2', '0']],
                    },
                },
                nonInline2: {
                    type: 'signalType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlineType0: {
                    generateLoopInline: ({ node: { args } }) =>
                        `${args.value} + 1`,
                },
                inlineType1: {
                    generateLoopInline: ({ node: { args }, ins }) =>
                        `${ins.$0} * ${args.value}`,
                },
                inlineType2: {
                    generateLoopInline: ({ node: { args }, ins }) =>
                        `${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
                },
                signalType: {},
            }

            const graphTraversalLoop = [
                'nonInline1',
                'n1',
                'n2',
                'n3',
                'n4',
                'nonInline2',
            ]
            const graphTraversalDeclare = [
                'nonInline1',
                'n1',
                'n2',
                'n3',
                'n4',
                'nonInline2',
            ]

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
                graphTraversalDeclare,
                graphTraversalLoop,
            })

            precompile(compilation)

            assert.strictEqual(
                compilation.precompilation.nonInline2.ins['0'],
                '(N4 * (N2 + 1) - N4 * ((nonInline1_OUTS_0 * N1) * N3))'
            )

            assert.deepStrictEqual(graphTraversalLoop, [
                'nonInline1',
                'nonInline2',
            ])
        })

        it('should work with non inlinable node with generateLoopInline and several sinks', () => {
            //    [  nonInline1  ]
            //      |
            //    [  n1  ]
            //      |
            //    [  n2  ]     <- non-inlinable cause 2 sinks
            //      / \
            //     |   \________________
            //     |                    \
            // [  nonInline2  ]      [  nonInline3  ]
            const graph = makeGraph({
                nonInline1: {
                    type: 'signalType',
                    sinks: {
                        '0': [['n1', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n1: {
                    type: 'inlineType1',
                    args: { value: 'N1' },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlineType1',
                    args: { value: 'N2' },
                    sinks: {
                        '0': [
                            ['nonInline2', '0'],
                            ['nonInline3', '0'],
                        ],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                nonInline2: {
                    type: 'signalType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                nonInline3: {
                    type: 'signalType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlineType1: {
                    generateLoopInline: ({ node: { args }, ins }) =>
                        `${ins.$0} * ${args.value}`,
                },
                signalType: {},
            }

            const graphTraversalLoop = [
                'nonInline1',
                'n1',
                'n2',
                'nonInline2',
                'nonInline3',
            ]
            const graphTraversalDeclare = [
                'nonInline1',
                'n1',
                'n2',
                'nonInline2',
                'nonInline3',
            ]

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
                graphTraversalDeclare,
                graphTraversalLoop,
            })

            precompile(compilation)

            assert.strictEqual(
                compilation.precompilation.n2.ins['0'],
                '(nonInline1_OUTS_0 * N1)'
            )
            assert.strictEqual(
                compilation.precompilation.nonInline2.ins['0'],
                'n2_OUTS_0'
            )
            assert.strictEqual(
                compilation.precompilation.nonInline3.ins['0'],
                'n2_OUTS_0'
            )

            assert.deepStrictEqual(graphTraversalLoop, [
                'nonInline1',
                'n2',
                'nonInline2',
                'nonInline3',
            ])
        })
    })
})
