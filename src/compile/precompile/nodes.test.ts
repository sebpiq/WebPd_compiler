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
import { Func, Var, AnonFunc, ast } from '../../ast/declare'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { makeCompilation } from '../../test-helpers'
import { NodeImplementations } from '../types'
import {
    precompileSignalOutlet,
    precompileSignalInletWithNoSource,
    precompileMessageOutlet,
    precompileMessageInlet,
    precompileMessageReceivers,
    precompileInitialization,
    precompileLoop,
    precompileInlineLoop,
    precompileStateInitialization,
} from './nodes'

describe('precompile.nodes', () => {
    describe('precompileSignalOutlet', () => {
        it('should substitute connected signal in with its source out for non-inline nodes', () => {
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

            const compilation = makeCompilation({
                graph,
            })

            precompileSignalOutlet(compilation, graph.node1, '0')
            precompileSignalOutlet(compilation, graph.node2, '0')

            // Creates a variable name for the signal out
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.signalOuts.$0,
                'node1_OUTS_0'
            )
            // Adds this variable name to precompilation `signalOuts`
            assert.strictEqual(
                compilation.precompilation.nodes.node1.signalOuts.$0,
                'node1_OUTS_0'
            )
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .signalOuts.$0,
                'node1_OUTS_0'
            )
            // Assigns node1's out to node2's in in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node2.generationContext
                    .signalIns.$0,
                'node1_OUTS_0'
            )
        })
    })

    describe('precompileSignalInletWithNoSource', () => {
        it('should put empty signal for unconnected inlet', () => {
            const graph = makeGraph({
                node1: {
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
            })

            precompileSignalInletWithNoSource(compilation, graph.node1, '0')

            // Substitute with empty signal in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .signalIns.$0,
                compilation.variableNamesIndex.globs.nullSignal
            )
        })
    })

    describe('precompileMessageOutlet', () => {
        it('should create messageSender if several sinks or io.messageSender', () => {
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
            })

            compilation.variableNamesIndex.nodes.node2.messageReceivers.$0 =
                'node2_RCVS_0'
            compilation.variableNamesIndex.nodes.node3.messageReceivers.$0 =
                'node3_RCVS_0'

            precompileMessageOutlet(compilation, graph.node1, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.messageSenders.$0,
                'node1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.messageSenders.$0,
                {
                    messageSenderName: 'node1_SNDS_0',
                    functionNames: ['node2_RCVS_0', 'node3_RCVS_0'],
                }
            )
            // Add the sender name in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .messageSenders.$0,
                'node1_SNDS_0'
            )
        })

        it('should create messageSender and add cold dsp function', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: { '0': [['node2', '0']] },
                },
                node2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.coldDspGroups = {
                '0': {
                    traversal: ['node2'],
                    outNodesIds: ['node2'],
                },
            }

            compilation.variableNamesIndex.nodes.node2.messageReceivers.$0 =
                'node2_RCVS_0'
            compilation.variableNamesIndex.coldDspGroups['0'] = 'DSP_0'

            precompileMessageOutlet(compilation, graph.node1, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.messageSenders.$0,
                'node1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.messageSenders.$0,
                {
                    messageSenderName: 'node1_SNDS_0',
                    functionNames: ['node2_RCVS_0', 'DSP_0'],
                }
            )
            // Add the sender name in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .messageSenders.$0,
                'node1_SNDS_0'
            )
        })

        it('should substitute message sender with null function if no sink and not outlet listener', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['node1']
            precompileMessageOutlet(compilation, graph.node1, '0')

            // Substitute with null function in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .messageSenders.$0,
                compilation.variableNamesIndex.globs.nullMessageReceiver
            )
        })

        it("should substitute message sender with the sink's receiver if only one sink", () => {
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
            })

            compilation.variableNamesIndex.nodes.node2.messageReceivers.$0 =
                'node2_RCVS_0'

            precompileMessageOutlet(compilation, graph.node1, '0')

            // Substitute with receiver name in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .messageSenders.$0,
                'node2_RCVS_0'
            )
        })

        it('should substitute message sender with outlet listener if no sinks', () => {
            const graph = makeGraph({
                node1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                settings: {
                    io: {
                        messageSenders: {
                            node1: { portletIds: ['0'] },
                        },
                        messageReceivers: {},
                    },
                },
            })

            compilation.variableNamesIndex.io.messageSenders.node1 = {
                '0': 'ioSnd_node1_0',
            }

            precompileMessageOutlet(compilation, graph.node1, '0')

            // Substitute with receiver name in generation context
            assert.strictEqual(
                compilation.precompilation.nodes.node1.generationContext
                    .messageSenders.$0,
                'ioSnd_node1_0'
            )
        })
    })

    describe('precompileMessageInlet', () => {
        it('should declare message inlet when it has one or more sources or io.messageReceivers', () => {
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
                // Works the same if no connection but io.messageReceivers is declared
                node4: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
                settings: {
                    io: {
                        messageReceivers: { node4: { portletIds: ['0'] } },
                        messageSenders: {},
                    },
                },
            })

            precompileMessageInlet(compilation, graph.node2, '0')
            precompileMessageInlet(compilation, graph.node3, '0')
            precompileMessageInlet(compilation, graph.node4, '0')

            // Creates a variable names for message receivers
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node2.messageReceivers.$0,
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node3.messageReceivers.$0,
                'node3_RCVS_0'
            )
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node4.messageReceivers.$0,
                'node4_RCVS_0'
            )

            // Add this variable names to generationContext
            assert.strictEqual(
                compilation.precompilation.nodes.node2.generationContext
                    .messageReceivers.$0,
                'node2_RCVS_0'
            )
            assert.strictEqual(
                compilation.precompilation.nodes.node3.generationContext
                    .messageReceivers.$0,
                'node3_RCVS_0'
            )
            assert.strictEqual(
                compilation.precompilation.nodes.node4.generationContext
                    .messageReceivers.$0,
                'node4_RCVS_0'
            )

            // Add placeholder messageReceivers
            assert.deepStrictEqual(
                compilation.precompilation.nodes.node2.messageReceivers.$0,
                Func(
                    'node2_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during compilation")`
            )
            assert.deepStrictEqual(
                compilation.precompilation.nodes.node3.messageReceivers.$0,
                Func(
                    'node3_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during compilation")`
            )
            assert.deepStrictEqual(
                compilation.precompilation.nodes.node4.messageReceivers.$0,
                Func(
                    'node4_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during compilation")`
            )
        })

        it('should declare no message receivers when inlet has no source', () => {
            const graph = makeGraph({
                node1: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const compilation = makeCompilation({
                graph,
            })

            precompileMessageInlet(compilation, graph.node1, '0')

            assert.ok(
                !(
                    '0' in
                    compilation.variableNamesIndex.nodes.node1.messageReceivers
                )
            )
            assert.ok(
                !(
                    '0' in
                    compilation.precompilation.nodes.node1.generationContext
                        .messageReceivers
                )
            )
            assert.ok(
                !(
                    '0' in
                    compilation.precompilation.nodes.node1.messageReceivers
                )
            )
        })
    })

    describe('precompileMessageReceivers', () => {
        it('should precompile messageReceivers where placeholder was declared', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
                node2: {
                    type: 'type2',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({
                        '0': AnonFunc([
                            Var('Message', 'm'),
                        ])`// message receiver type1 inlet 0`,
                        '1': AnonFunc([
                            Var('Message', 'm'),
                        ])`// message receiver type1 inlet 1`,
                    }),
                },
                type2: {
                    messageReceivers: () => ({
                        '0': AnonFunc([
                            Var('Message', 'm'),
                        ])`// message receiver type2 inlet 0`,
                        // extra message receiver that will be ignored
                        '1': AnonFunc([
                            Var('Message', 'm'),
                        ])`// message receiver type2 inlet 1`,
                    }),
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.variableNamesIndex.nodes.node1.messageReceivers.$0 =
                'node1_RCVS_0'
            compilation.precompilation.nodes.node1.messageReceivers.$0 = AnonFunc()``
            compilation.variableNamesIndex.nodes.node1.messageReceivers.$1 =
                'node1_RCVS_1'
            compilation.precompilation.nodes.node1.messageReceivers.$1 = AnonFunc()``
            compilation.variableNamesIndex.nodes.node2.messageReceivers.$0 =
                'node2_RCVS_0'
            compilation.precompilation.nodes.node2.messageReceivers.$0 = AnonFunc()``

            precompileMessageReceivers(compilation, graph.node1)
            precompileMessageReceivers(compilation, graph.node2)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.messageReceivers,
                {
                    '0': Func('node1_RCVS_0', [
                        Var('Message', 'm'),
                    ])`// message receiver type1 inlet 0`,
                    '1': Func('node1_RCVS_1', [
                        Var('Message', 'm'),
                    ])`// message receiver type1 inlet 1`,
                }
            )

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node2.messageReceivers,
                {
                    '0': Func('node2_RCVS_0', [
                        Var('Message', 'm'),
                    ])`// message receiver type2 inlet 0`,
                }
            )
        })

        it('should throw an error if messageReceiver is missing', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
                node2: {
                    type: 'type2',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({}),
                },
                type2: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.variableNamesIndex.nodes.node1.messageReceivers.$0 =
                'node1_RCVS_0'
            compilation.precompilation.nodes.node1.messageReceivers.$0 = AnonFunc()``
            compilation.variableNamesIndex.nodes.node2.messageReceivers.$0 =
                'node2_RCVS_0'
            compilation.precompilation.nodes.node2.messageReceivers.$0 = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(compilation, graph.node1)
            )
            assert.throws(() =>
                precompileMessageReceivers(compilation, graph.node2)
            )
        })

        it('should throw an error if messageReceiver has wrong signature', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({
                        '0': AnonFunc([], 'Int')``,
                    }),
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.variableNamesIndex.nodes.node1.messageReceivers.$0 =
                'node1_RCVS_0'
            compilation.precompilation.nodes.node1.messageReceivers.$0 = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(compilation, graph.node1)
            )
        })
    })

    describe('precompileStateInitialization', () => {
        it('should precompile node stateInitialization', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    stateInitialization: ({ node: { args } }) =>
                        Var('State', '', `{ a: ${args.a}, b: ${args.b} }`),
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileStateInitialization(compilation, graph.node1)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.stateInitialization,
                Var('State', '', `{ a: 22, b: 33 }`)
            )
        })
    })

    describe('precompileInitialization', () => {
        it('should precompile node initialization', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    initialization: () => ast`// initialization type1`,
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileInitialization(compilation, graph.node1)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.initialization,
                ast`// initialization type1`
            )
        })

        it('should add empty initialization if not declared', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileInitialization(compilation, graph.node1)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.initialization,
                ast``
            )
        })
    })

    describe('precompileLoop', () => {
        it('should precompile node loop', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    loop: () => ast`// loop type1`,
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileLoop(compilation, graph.node1)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.loop,
                ast`// loop type1`
            )
        })

        it('should precompile inline node loop', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    inlineLoop: () => ast`a + b`,
                },
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.variableNamesIndex.nodes.node1.signalOuts.$0 =
                'node1_OUTS_0'

            precompileLoop(compilation, graph.node1)

            assert.deepStrictEqual(
                compilation.precompilation.nodes.node1.loop,
                ast`node1_OUTS_0 = a + b`
            )
        })

        it('should throw an error if not loop nor inlineLoop', () => {
            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            assert.throws(() => precompileLoop(compilation, graph.node1))
        })
    })

    describe('precompileInlineLoop', () => {
        it('should compile the inline loop code', () => {
            //       [  n1  ]
            //            \
            // [  n2  ]  [  n3  ]
            //   \        /
            //    \      /
            //     \    /
            //    [  n4  ]  <- out node for the inlinable dsp group
            //        |
            //    [  n5  ]  <- first non-inlinable sink
            const graph = makeGraph({
                n1: {
                    type: 'inlinableType0',
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
                    type: 'inlinableType0',
                    args: { value: 'N2' },
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
                    type: 'inlinableType1',
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
                    type: 'inlinableType2',
                    args: { value: 'N4' },
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
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType0: {
                    inlineLoop: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${ins.$0} * ${args.value}`,
                },
                inlinableType2: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
                },
                nonInlinableType: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineLoop(compilation, {
                traversal: ['n2', 'n1', 'n3', 'n4'],
                outNodesIds: ['n4'],
            })

            assert.strictEqual(
                compilation.precompilation.nodes.n5.generationContext.signalIns
                    .$0,
                `(N4 * (N2 + 1) - N4 * ((N1 + 1) * N3))`
            )
        })

        it('shouldnt cause any problem with message inlets', () => {
            // [  n1  ]  [  n0  ] <- message node
            //       \    /
            //      [  n2  ]
            //         |
            //         |
            //         |
            //      [  n3  ]  <- out node for the inlinable dsp group
            //         |
            //      [  n4  ]  <- first non-inlinable sink
            const graph = makeGraph({
                n0: {
                    type: 'messageType',
                    isPushingMessages: true,
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    sinks: {
                        '0': [['n2', '1']],
                    },
                },
                n1: {
                    type: 'inlinableType0',
                    args: { value: 'N1' },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlinableType1',
                    args: { value: 'N2' },
                    sinks: {
                        '0': [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    type: 'inlinableType1',
                    args: { value: 'N3' },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        '0': [['n4', '0']],
                    },
                },
                n4: {
                    type: 'nonInlinableType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                messageType: {},
                inlinableType0: {
                    inlineLoop: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${ins.$0} * ${args.value}`,
                },
                nonInlinableType: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineLoop(compilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                compilation.precompilation.nodes.n4.generationContext.signalIns
                    .$0,
                '(((N1 + 1) * N2) * N3)'
            )
        })

        it('shouldnt fail with non-connected signal inlet', () => {
            // [  n1  ]
            //       \    /
            //      [  n2  ]
            //         |
            //         |
            //         |
            //      [  n3  ]
            const graph = makeGraph({
                n1: {
                    type: 'inlinableType0',
                    args: { value: 'N1' },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    type: 'inlinableType2',
                    args: { value: 'N2' },
                    sinks: {
                        '0': [['n3', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        // Inlet to another node / or unconnected
                        '1': { type: 'signal', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    type: 'inlinableType1',
                    args: { value: 'N3' },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        '0': [['n4', '0']],
                    },
                },
                n4: {
                    type: 'nonInlinableType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType0: {
                    inlineLoop: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${ins.$0} * ${args.value}`,
                },
                inlinableType2: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
                },
                nonInlinableType: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.precompilation.nodes.n2.generationContext.signalIns.$1 =
                'BLA'

            precompileInlineLoop(compilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                compilation.precompilation.nodes.n4.generationContext.signalIns
                    .$0,
                '((N2 * (N1 + 1) - N2 * BLA) * N3)'
            )
        })

        it('shouldnt fail with non-inlinable source', () => {
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
                    type: 'inlinableType1',
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
                    type: 'inlinableType1',
                    args: { value: 'N2' },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    sinks: {
                        '0': [['n3', '0']],
                    },
                },
                n3: {
                    type: 'nonInlinableType',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType1: {
                    inlineLoop: ({ node: { args }, ins }) =>
                        ast`${ins.$0} * ${args.value}`,
                },
                signalType: {},
                nonInlinableType: {},
            }

            const compilation = makeCompilation({
                graph,
                nodeImplementations,
            })

            compilation.precompilation.nodes.n1.generationContext.signalIns.$0 =
                'nonInline1_OUTS_0'

            precompileInlineLoop(compilation, {
                traversal: ['n1', 'n2'],
                outNodesIds: ['n2'],
            })

            assert.strictEqual(
                compilation.precompilation.nodes.n3.generationContext.signalIns
                    .$0,
                '((nonInline1_OUTS_0 * N1) * N2)'
            )
        })
    })
})
