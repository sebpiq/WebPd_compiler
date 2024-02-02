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
import { Func, Var, AnonFunc, ast, Class } from '../../ast/declare'
import { makeGraph } from '../../dsp-graph/test-helpers'
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
    precompileState,
    precompileCaching,
} from './nodes'
import { makePrecompilation } from './test-helpers'

describe('precompile.nodes', () => {
    describe('precompileSignalOutlet', () => {
        it('should substitute connected signal in with its source out for non-inline nodes', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileSignalOutlet(precompilation, graph.n1, '0')
            precompileSignalOutlet(precompilation, graph.n2, '0')

            // Creates a variable name for the signal out
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1.signalOuts.$0,
                'n1_OUTS_0'
            )
            // Adds this variable name to precompilation `signalOuts`
            assert.strictEqual(
                precompilation.output.nodes.n1.signalOuts.$0,
                'n1_OUTS_0'
            )
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext.signalOuts
                    .$0,
                'n1_OUTS_0'
            )
            // Assigns n1's out to n2's in in generation context
            assert.strictEqual(
                precompilation.output.nodes.n2.generationContext.signalIns
                    .$0,
                'n1_OUTS_0'
            )
        })
    })

    describe('precompileSignalInletWithNoSource', () => {
        it('should put empty signal for unconnected inlet', () => {
            const graph = makeGraph({
                n1: {
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileSignalInletWithNoSource(precompilation, graph.n1, '0')

            // Substitute with empty signal in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext.signalIns
                    .$0,
                precompilation.output.variableNamesIndex.globs.nullSignal
            )
        })
    })

    describe('precompileMessageOutlet', () => {
        it('should create messageSender if several sinks or io.messageSender', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.variableNamesIndex.nodes.n3.messageReceivers.$0 =
                'n3_RCVS_0'

            precompileMessageOutlet(precompilation, graph.n1, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1.messageSenders.$0,
                'n1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1.messageSenders.$0,
                {
                    messageSenderName: 'n1_SNDS_0',
                    functionNames: ['n2_RCVS_0', 'n3_RCVS_0'],
                }
            )
            // Add the sender name in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext
                    .messageSenders.$0,
                'n1_SNDS_0'
            )
        })

        it('should create messageSender and add cold dsp function', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: { '0': [['n2', '0']] },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.graph.coldDspGroups = {
                '0': {
                    traversal: ['n2'],
                    outNodesIds: ['n2'],
                    sinkConnections: [],
                },
            }

            precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.variableNamesIndex.coldDspGroups['0'] = 'DSP_0'

            precompileMessageOutlet(precompilation, graph.n1, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1.messageSenders.$0,
                'n1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1.messageSenders.$0,
                {
                    messageSenderName: 'n1_SNDS_0',
                    functionNames: ['n2_RCVS_0', 'DSP_0'],
                }
            )
            // Add the sender name in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext
                    .messageSenders.$0,
                'n1_SNDS_0'
            )
        })

        it('should substitute message sender with null function if no sink and not outlet listener', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.graph.fullTraversal = ['n1']
            precompileMessageOutlet(precompilation, graph.n1, '0')

            // Substitute with null function in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext
                    .messageSenders.$0,
                precompilation.output.variableNamesIndex.globs.nullMessageReceiver
            )
        })

        it("should substitute message sender with the sink's receiver if only one sink", () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0 =
                'n2_RCVS_0'

            precompileMessageOutlet(precompilation, graph.n1, '0')

            // Substitute with receiver name in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext
                    .messageSenders.$0,
                'n2_RCVS_0'
            )
        })

        it('should substitute message sender with outlet listener if no sinks', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
                settings: {
                    io: {
                        messageSenders: {
                            n1: { portletIds: ['0'] },
                        },
                        messageReceivers: {},
                    },
                },
            })

            precompilation.output.variableNamesIndex.io.messageSenders.n1 = {
                '0': 'ioSnd_n1_0',
            }

            precompileMessageOutlet(precompilation, graph.n1, '0')

            // Substitute with receiver name in generation context
            assert.strictEqual(
                precompilation.output.nodes.n1.generationContext
                    .messageSenders.$0,
                'ioSnd_n1_0'
            )
        })
    })

    describe('precompileMessageInlet', () => {
        it('should declare message inlet when it has one or more sources or io.messageReceivers', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'message' },
                        '1': { id: '1', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                        '1': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                // Works the same if no connection but io.messageReceivers is declared
                n4: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
                settings: {
                    io: {
                        messageReceivers: { n4: { portletIds: ['0'] } },
                        messageSenders: {},
                    },
                },
            })

            precompileMessageInlet(precompilation, graph.n2, '0')
            precompileMessageInlet(precompilation, graph.n3, '0')
            precompileMessageInlet(precompilation, graph.n4, '0')

            // Creates a variable names for message receivers
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0,
                'n2_RCVS_0'
            )
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n3.messageReceivers.$0,
                'n3_RCVS_0'
            )
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n4.messageReceivers.$0,
                'n4_RCVS_0'
            )

            // Add this variable names to generationContext
            assert.strictEqual(
                precompilation.output.nodes.n2.generationContext
                    .messageReceivers.$0,
                'n2_RCVS_0'
            )
            assert.strictEqual(
                precompilation.output.nodes.n3.generationContext
                    .messageReceivers.$0,
                'n3_RCVS_0'
            )
            assert.strictEqual(
                precompilation.output.nodes.n4.generationContext
                    .messageReceivers.$0,
                'n4_RCVS_0'
            )

            // Add placeholder messageReceivers
            assert.deepStrictEqual(
                precompilation.output.nodes.n2.messageReceivers.$0,
                Func(
                    'n2_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
            assert.deepStrictEqual(
                precompilation.output.nodes.n3.messageReceivers.$0,
                Func(
                    'n3_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
            assert.deepStrictEqual(
                precompilation.output.nodes.n4.messageReceivers.$0,
                Func(
                    'n4_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
        })

        it('should declare no message receivers when inlet has no source', () => {
            const graph = makeGraph({
                n1: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileMessageInlet(precompilation, graph.n1, '0')

            assert.ok(
                !(
                    '0' in
                    precompilation.output.variableNamesIndex.nodes.n1.messageReceivers
                )
            )
            assert.ok(
                !(
                    '0' in
                    precompilation.output.nodes.n1.generationContext
                        .messageReceivers
                )
            )
            assert.ok(
                !('0' in precompilation.output.nodes.n1.messageReceivers)
            )
        })
    })

    describe('precompileMessageReceivers', () => {
        it('should precompile messageReceivers where placeholder was declared', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
                n2: {
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.variableNamesIndex.nodes.n1.messageReceivers.$0 =
                'n1_RCVS_0'
            precompilation.output.nodes.n1.messageReceivers.$0 = AnonFunc()``
            precompilation.output.variableNamesIndex.nodes.n1.messageReceivers.$1 =
                'n1_RCVS_1'
            precompilation.output.nodes.n1.messageReceivers.$1 = AnonFunc()``
            precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.nodes.n2.messageReceivers.$0 = AnonFunc()``

            precompileMessageReceivers(precompilation, graph.n1)
            precompileMessageReceivers(precompilation, graph.n2)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.messageReceivers,
                {
                    '0': Func('n1_RCVS_0', [
                        Var('Message', 'm'),
                    ])`// message receiver type1 inlet 0`,
                    '1': Func('n1_RCVS_1', [
                        Var('Message', 'm'),
                    ])`// message receiver type1 inlet 1`,
                }
            )

            assert.deepStrictEqual(
                precompilation.output.nodes.n2.messageReceivers,
                {
                    '0': Func('n2_RCVS_0', [
                        Var('Message', 'm'),
                    ])`// message receiver type2 inlet 0`,
                }
            )
        })

        it('should throw an error if messageReceiver is missing', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
                n2: {
                    type: 'type2',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({}),
                },
                type2: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.variableNamesIndex.nodes.n1.messageReceivers.$0 =
                'n1_RCVS_0'
            precompilation.output.nodes.n1.messageReceivers.$0 = AnonFunc()``
            precompilation.output.variableNamesIndex.nodes.n2.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.nodes.n2.messageReceivers.$0 = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(precompilation, graph.n1)
            )
            assert.throws(() =>
                precompileMessageReceivers(precompilation, graph.n2)
            )
        })

        it('should throw an error if messageReceiver has wrong signature', () => {
            const graph = makeGraph({
                n1: {
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.variableNamesIndex.nodes.n1.messageReceivers.$0 =
                'n1_RCVS_0'
            precompilation.output.nodes.n1.messageReceivers.$0 = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(precompilation, graph.n1)
            )
        })
    })

    describe('precompileCaching', () => {
        it('should precompile caching functions', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
                n2: {
                    type: 'type2',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
                type2: {
                    caching: () => ({
                        '0': ast`// caching inlet 0`,
                        '1': ast`// caching inlet 1`,
                    }),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileCaching(precompilation, graph.n1!)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.caching,
                {}
            )

            precompileCaching(precompilation, graph.n2!)

            assert.deepStrictEqual(
                precompilation.output.nodes.n2.caching,
                {
                    '0': ast`// caching inlet 0`,
                    '1': ast`// caching inlet 1`,
                }
            )
        })
    })

    describe('precompileState', () => {
        it('should precompile node state initialization', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    state: ({ node: { args } }) =>
                        Class('State_type1', [
                            Var('Int', 'a', args.a),
                            Var('Int', 'b', args.b),
                        ]),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.variableNamesIndex.nodeImplementations.type1.stateClass = 'State_type1'

            precompileState(precompilation, graph.n1)

            assert.deepStrictEqual(precompilation.output.nodes.n1.state, {
                className: 'State_type1',
                initialization: {
                    a: {
                        astType: 'Sequence',
                        content: ['22'],
                    },
                    b: {
                        astType: 'Sequence',
                        content: ['33'],
                    },
                },
            })
        })
    })

    describe('precompileInitialization', () => {
        it('should precompile node initialization', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    initialization: () => ast`// initialization type1`,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInitialization(precompilation, graph.n1)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.initialization,
                ast`// initialization type1`
            )
        })

        it('should add empty initialization if not declared', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInitialization(precompilation, graph.n1)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.initialization,
                ast``
            )
        })
    })

    describe('precompileLoop', () => {
        it('should precompile node loop', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    loop: () => ast`// loop type1`,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileLoop(precompilation, graph.n1)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.loop,
                ast`// loop type1`
            )
        })

        it('should precompile inline node loop', () => {
            const graph = makeGraph({
                n1: {
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.variableNamesIndex.nodes.n1.signalOuts.$0 = 'n1_OUTS_0'

            precompileLoop(precompilation, graph.n1)

            assert.deepStrictEqual(
                precompilation.output.nodes.n1.loop,
                ast`n1_OUTS_0 = a + b`
            )
        })

        it('should throw an error if not loop nor inlineLoop', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.throws(() => precompileLoop(precompilation, graph.n1))
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineLoop(precompilation, {
                traversal: ['n2', 'n1', 'n3', 'n4'],
                outNodesIds: ['n4'],
            })

            assert.strictEqual(
                precompilation.output.nodes.n5.generationContext.signalIns
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineLoop(precompilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                precompilation.output.nodes.n4.generationContext.signalIns
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.nodes.n2.generationContext.signalIns.$1 =
                'BLA'

            precompileInlineLoop(precompilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                precompilation.output.nodes.n4.generationContext.signalIns
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

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.output.nodes.n1.generationContext.signalIns.$0 =
                'nonInline1_OUTS_0'

            precompileInlineLoop(precompilation, {
                traversal: ['n1', 'n2'],
                outNodesIds: ['n2'],
            })

            assert.strictEqual(
                precompilation.output.nodes.n3.generationContext.signalIns
                    .$0,
                '((nonInline1_OUTS_0 * N1) * N2)'
            )
        })
    })
})
