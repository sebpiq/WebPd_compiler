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
import { Func, Var, AnonFunc, ast, Class, Sequence } from '../../ast/declare'
import { makeGraph } from '../../test-helpers/graph-test-helpers'
import { NodeImplementations } from '../types'
import {
    precompileMessageReceivers,
    precompileInitialization,
    precompileDsp,
    precompileInlineDsp,
    precompileState,
} from './nodes'
import { makePrecompilation } from '../test-helpers'
import { STATE_CLASS_NAME } from './node-implementations'

describe('precompile.nodes', () => {
    describe('precompileMessageReceivers', () => {
        it('should precompile messageReceivers where placeholder was declared', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                },
                n2: {
                    type: 'type2',
                    isPushingMessages: true,
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: (_, { msg }) => ({
                        '0': AnonFunc([
                            Var(msg.Message!, `m`),
                        ])`// message receiver type1 inlet 0`,
                        '1': AnonFunc([
                            Var(msg.Message!, `m`),
                        ])`// message receiver type1 inlet 1`,
                    }),
                },
                type2: {
                    messageReceivers: (_, { msg }) => ({
                        '0': AnonFunc([
                            Var(msg.Message!, `m`),
                        ])`// message receiver type2 inlet 0`,
                        // extra message receiver that will be ignored
                        '1': AnonFunc([
                            Var(msg.Message!, `m`),
                        ])`// message receiver type2 inlet 1`,
                    }),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })
            const globals = precompilation.variableNamesAssigner.globals
            // Make sure name is defined
            globals.msg!.Message!

            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '0'
            ] = AnonFunc()``
            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '1'
            ] = AnonFunc()``
            precompilation.precompiledCodeAssigner.nodes.n2!.messageReceivers[
                '0'
            ] = AnonFunc()``

            precompileMessageReceivers(precompilation, precompilation.graph.n1!)
            precompileMessageReceivers(precompilation, precompilation.graph.n2!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.messageReceivers,
                {
                    '0': Func('N_n1_rcvs_0', [
                        Var(globals.msg!.Message!, `m`),
                    ])`// message receiver type1 inlet 0`,
                    '1': Func('N_n1_rcvs_1', [
                        Var(globals.msg!.Message!, `m`),
                    ])`// message receiver type1 inlet 1`,
                }
            )

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n2!.messageReceivers,
                {
                    '0': Func('N_n2_rcvs_0', [
                        Var(globals.msg!.Message!, `m`),
                    ])`// message receiver type2 inlet 0`,
                }
            )

            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n1!.messageReceivers,
                {
                    '0': 'N_n1_rcvs_0',
                    '1': 'N_n1_rcvs_1',
                }
            )

            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n2!.messageReceivers,
                {
                    '0': 'N_n2_rcvs_0',
                }
            )
        })

        it('should throw an error if messageReceiver is missing', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                },
                n2: {
                    type: 'type2',
                    isPushingMessages: true,
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

            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '0'
            ] = AnonFunc()``
            precompilation.precompiledCodeAssigner.nodes.n2!.messageReceivers[
                '0'
            ] = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(
                    precompilation,
                    precompilation.graph.n1!
                )
            )
            assert.throws(() =>
                precompileMessageReceivers(
                    precompilation,
                    precompilation.graph.n2!
                )
            )
        })

        it('should throw an error if messageReceiver has wrong signature', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
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

            precompilation.precompiledCodeAssigner.nodes.n1!.messageReceivers[
                '0'
            ] = AnonFunc()``

            assert.throws(() =>
                precompileMessageReceivers(
                    precompilation,
                    precompilation.graph.n1!
                )
            )
        })
    })

    describe('precompileState', () => {
        it('should precompile node state initialization', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    state: ({ ns, node: { args } }) =>
                        Class(ns.State!, [
                            Var(`Int`, `a`, args.a),
                            Var(`Int`, `b`, args.b),
                        ]),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            // Make sure the state class name is defined
            precompilation.variableNamesAssigner.nodeImplementations.type1![
                STATE_CLASS_NAME
            ]!

            precompileState(precompilation, precompilation.graph.n1!)

            assert.strictEqual(
                precompilation.variableNamesIndex.nodes.n1!.state,
                'N_n1_state'
            )
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.state,
                {
                    name: 'N_n1_state',
                    initialization: {
                        a: Sequence([ast`22`]),
                        b: Sequence([ast`33`]),
                    },
                }
            )
        })
    })

    describe('precompileInitialization', () => {
        it('should precompile node initialization', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
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

            precompileInitialization(precompilation, precompilation.graph.n1!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.initialization,
                ast`// initialization type1`
            )
        })

        it('should add empty initialization if not declared', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPushingMessages: true,
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInitialization(precompilation, precompilation.graph.n1!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.initialization,
                ast``
            )
        })
    })

    describe('precompileDsp', () => {
        it('should precompile node loop dsp', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPullingSignal: true,
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    dsp: () => ast`// dsp type1`,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileDsp(precompilation, precompilation.graph.n1!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.dsp,
                {
                    loop: ast`// dsp type1`,
                    inlets: {},
                }
            )
        })

        it('should precompile inline node loop dsp', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPullingSignal: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: () => ast`a + b`,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileDsp(precompilation, precompilation.graph.n1!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.dsp,
                {
                    loop: ast`N_n1_outs_0 = a + b`,
                    inlets: {},
                }
            )
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n1!.signalOuts,
                { '0': 'N_n1_outs_0' }
            )
        })

        it('should precompile node inlets dsp', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPullingSignal: true,
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    dsp: () => ({
                        inlets: {
                            '0': ast`// inlet dsp 0`,
                            '1': ast`// inlet dsp 1`,
                        },
                        loop: ast``,
                    }),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileDsp(precompilation, precompilation.graph.n1!)

            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.dsp,
                {
                    loop: ast``,
                    inlets: {
                        '0': ast`// inlet dsp 0`,
                        '1': ast`// inlet dsp 1`,
                    },
                }
            )
        })

        it('should throw an error if no dsp', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    isPullingSignal: true,
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            assert.throws(() =>
                precompileDsp(precompilation, precompilation.graph.n1!)
            )
        })
    })

    describe('precompileInlineDsp', () => {
        it('should compile the inline dsp code', () => {
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
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType0: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${ins.$0!} * ${args.value}`,
                },
                inlinableType2: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${args.value} * ${ins.$0!} - ${
                            args.value
                        } * ${ins.$1!}`,
                },
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineDsp(precompilation, {
                traversal: ['n2', 'n1', 'n3', 'n4'],
                outNodesIds: ['n4'],
            })

            assert.strictEqual(
                precompilation.precompiledCode.nodes.n5!.signalIns['0'],
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
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                messageType: {},
                inlinableType0: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${ins.$0!} * ${args.value}`,
                },
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileInlineDsp(precompilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                precompilation.precompiledCode.nodes.n4!.signalIns['0'],
                '(((N1 + 1) * N2) * N3)'
            )
        })

        it('shouldnt fail with non-connected signal inlet', () => {
            // [  n1  ]
            //       \    /
            //      [  n2  ]
            //         |
            //      [  n3  ]
            //         |
            //      [  n4  ]
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
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType0: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args } }) => ast`${args.value} + 1`,
                },
                inlinableType1: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${ins.$0!} * ${args.value}`,
                },
                inlinableType2: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${args.value} * ${ins.$0!} - ${
                            args.value
                        } * ${ins.$1!}`,
                },
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCodeAssigner.nodes.n2!.signalIns['1'] =
                'BLA'

            precompileInlineDsp(precompilation, {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            })

            assert.strictEqual(
                precompilation.precompiledCode.nodes.n4!.signalIns['0'],
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
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                inlinableType1: {
                    flags: {
                        isDspInline: true,
                    },
                    dsp: ({ node: { args }, ins }) =>
                        ast`${ins.$0!} * ${args.value}`,
                },
                signalType: {},
                nonInlinableType: {},
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCodeAssigner.nodes.n1!.signalIns['0'] =
                'N_nonInline1_outs_0'

            precompileInlineDsp(precompilation, {
                traversal: ['n1', 'n2'],
                outNodesIds: ['n2'],
            })

            assert.strictEqual(
                precompilation.precompiledCode.nodes.n3!.signalIns['0'],
                '((N_nonInline1_outs_0 * N1) * N2)'
            )
        })
    })
})
