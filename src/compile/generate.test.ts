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
import { NodeImplementations } from './types'
import { makeCompilation } from '../test-helpers'
import { makeGraph } from '../dsp-graph/test-helpers'
import precompile from './precompile'
import { AnonFunc, ConstVar, Func, Var, ast } from '../ast/declare'
import {
    assertAstSequencesAreEqual,
    normalizeAstSequence,
} from '../ast/test-helpers'
import {
    generateColdDspFunctions,
    generateColdDspInitialization,
    generateIoMessageReceivers,
    generateLoop,
    generateNodeInitializations,
    generateNodeStateDeclarations,
    generatePortletsDeclarations,
} from './generate'
import { AstSequence } from '../ast/types'

describe('generate', () => {
    describe('generatePortletsDeclarations', () => {
        const MESSAGE_RECEIVER_FUNC = AnonFunc([Var('Message', 'm')])``

        it('should compile declarations for signal outlets', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['n1', 'n2']
            compilation.precompilation.nodes.n1.signalOuts.$0 = 'n1_OUTS_0'
            compilation.precompilation.nodes.n1.signalOuts.$1 = 'n1_OUTS_1'
            compilation.precompilation.nodes.n2.signalOuts.$0 = 'n2_OUTS_0'

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    Var('Float', 'n1_OUTS_0', '0'),
                    Var('Float', 'n1_OUTS_1', '0'),
                    Var('Float', 'n2_OUTS_0', '0'),
                ],
            })
        })

        it('should compile node message receivers', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['n1', 'n2']
            compilation.precompilation.nodes.n1.messageReceivers.$0 = Func(
                'n1_RCVS_0',
                [Var('Message', 'm')]
            )`// [n1] message receiver 0`
            compilation.precompilation.nodes.n1.messageReceivers.$1 = Func(
                'n1_RCVS_1',
                [Var('Message', 'm')]
            )`// [n1] message receiver 1`
            compilation.precompilation.nodes.n2.messageReceivers.$0 = Func(
                'n2_RCVS_0',
                [Var('Message', 'm')]
            )`// [n2] message receiver 0`

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n1] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "n1", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_RCVS_1',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n1] message receiver 1\n' +
                                    `throw new Error('[DUMMY], id "n1", inlet "1", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n2_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n2] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "n2", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should render correct error throw if debug = true', () => {
            const graph = makeGraph({
                n1: {},
            })

            const compilation = makeCompilation({
                graph,
                settings: { debug: true },
            })

            compilation.precompilation.graph.fullTraversal = ['n1']
            compilation.precompilation.nodes.n1.messageReceivers.$0 = Func(
                'n1_RCVS_0',
                [Var('Message', 'm')]
            )`// [n1] message receiver 0`

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'n1_RCVS_0',
                        args: [
                            {
                                astType: 'Var',
                                name: 'm',
                                type: 'Message',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [n1] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "n1", inlet "0", unsupported message : ' + msg_display(m) + '\\nDEBUG : remember, you must return from message receiver')`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should compile node message senders', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
                n3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['n1', 'n2', 'n3']
            compilation.precompilation.nodes.n1.messageSenders.$0 = {
                messageSenderName: 'n1_SNDS_0',
                functionNames: ['n2_RCVS_0', 'n2_RCVS_1', 'DSP_1'],
            }
            compilation.precompilation.nodes.n1.messageSenders.$1 = {
                messageSenderName: 'n1_SNDS_1',
                functionNames: ['outlerListener_n1_0'],
            }
            compilation.precompilation.nodes.n2.messageSenders.$0 = {
                messageSenderName: 'n2_SNDS_0',
                functionNames: ['n3_RCVS_0'],
            }

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['n2_RCVS_0(m)\nn2_RCVS_1(m)\nDSP_1(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n1_SNDS_1',
                        body: {
                            astType: 'Sequence',
                            content: ['outlerListener_n1_0(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'n2_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['n3_RCVS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('generateNodeStateDeclarations', () => {
        it('should compile declarations for node state and filter out nodes with no state declaration', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
                n3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['n1', 'n2', 'n3']
            compilation.precompilation.nodes.n1.stateInitialization = Var(
                'State',
                '',
                `{ a: 111, b: 222 }`
            )
            compilation.precompilation.nodes.n2.stateInitialization = Var(
                'State',
                '',
                `{ a: 333, b: 444 }`
            )
            compilation.precompilation.nodes.n3.stateInitialization = null

            const sequence = generateNodeStateDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    ConstVar('State', 'n1_STATE', '{ a: 111, b: 222 }'),
                    ConstVar('State', 'n2_STATE', '{ a: 333, b: 444 }'),
                ],
            })
        })
    })

    describe('generateNodeInitializations', () => {
        it('should generate initializations for nodes', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.fullTraversal = ['n1', 'n2']
            compilation.precompilation.nodes.n1.initialization = ast`
                ${Var('Float', 'n1', '0')}
                console.log(n1)
            `
            compilation.precompilation.nodes.n2.initialization = ast``

            const sequence = generateNodeInitializations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [Var('Float', 'n1', '0'), 'console.log(n1)'],
            })
        })
    })

    describe('generateIoMessageReceivers', () => {
        it('should compile declared inlet callers', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    messageReceivers: () => ({
                        '0': AnonFunc(
                            [Var('Message', 'm')],
                            'void'
                        )`// [type1] message receiver`,
                    }),
                },
            }

            const compilation = makeCompilation({
                graph,
                settings: {
                    io: {
                        messageReceivers: { n1: { portletIds: ['0'] } },
                        messageSenders: {},
                    },
                },
                nodeImplementations,
            })

            precompile(compilation)

            const sequence = generateIoMessageReceivers(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'ioRcv_n1_0',
                        args: [
                            {
                                astType: 'Var',
                                name: 'm',
                                type: 'Message',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: ['n1_RCVS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('generateLoop', () => {
        it('should compile the loop function', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
                n3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.hotDspGroup = {
                traversal: ['n1', 'n2', 'n3'],
                outNodesIds: ['n3'],
            }
            compilation.precompilation.nodes.n1.loop = ast`// n1`
            compilation.precompilation.nodes.n2.loop = ast`// n2`
            compilation.precompilation.nodes.n3.loop = ast`// n3`

            const sequence = generateLoop(compilation)

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                {
                    astType: 'Sequence',
                    content: [
                        `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                            '// n1\n' +
                            '// n2\n' +
                            '// n3\n' +
                            `FRAME++\n}`,
                    ],
                }
            )
        })

        it('should add to the loop caching functions not connected to cold dsp', () => {
            const graph = makeGraph({
                n1: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.nodes.n1.caching.$0 = ast`// caching 0`
            compilation.precompilation.nodes.n1.loop = ast`// n1`
            compilation.precompilation.graph.hotDspGroup = {
                traversal: ['n1'],
                outNodesIds: ['n1'],
            }
            compilation.precompilation.graph.coldDspGroups = {}

            const sequence = generateLoop(compilation)

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                {
                    astType: 'Sequence',
                    content: [
                        `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                            '// caching 0\n' +
                            '// n1\n' +
                            `FRAME++\n}`,
                    ],
                }
            )
        })
    })

    describe('generateColdDspInitialization', () => {
        it('should compile cold dsp initialization', () => {
            const graph = makeGraph({})

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.graph.coldDspGroups = {
                '0': {
                    traversal: [],
                    outNodesIds: [],
                    sinkConnections: [],
                },
                '1': {
                    traversal: [],
                    outNodesIds: [],
                    sinkConnections: [],
                },
            }

            compilation.variableNamesIndex.coldDspGroups.$0 = 'DSP_0'
            compilation.variableNamesIndex.coldDspGroups.$1 = 'DSP_1'

            const sequence = generateColdDspInitialization(compilation)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [`DSP_0(EMPTY_MESSAGE)\nDSP_1(EMPTY_MESSAGE)`],
            })
        })
    })

    describe('generateColdDspFunctions', () => {
        it('should compile cold dsp functions', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
                n3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.nodes.n1.loop = ast`// n1`
            compilation.precompilation.nodes.n2.loop = ast`// n2`
            compilation.precompilation.nodes.n3.loop = ast`// n3`

            compilation.precompilation.graph.coldDspGroups = {
                '0': {
                    traversal: ['n1', 'n2'],
                    outNodesIds: ['n2'],
                    sinkConnections: [],
                },
                '1': {
                    traversal: ['n3'],
                    outNodesIds: ['n3'],
                    sinkConnections: [],
                },
            }

            compilation.variableNamesIndex.coldDspGroups.$0 = 'DSP_0'
            compilation.variableNamesIndex.coldDspGroups.$1 = 'DSP_1'

            const sequence = generateColdDspFunctions(compilation)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'DSP_0',
                        args: [
                            {
                                astType: 'Var',
                                name: 'm',
                                type: 'Message',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: ['// n1' + '\n' + '// n2'],
                        },
                    },
                    {
                        astType: 'Func',
                        name: 'DSP_1',
                        args: [
                            {
                                astType: 'Var',
                                name: 'm',
                                type: 'Message',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: ['// n3'],
                        },
                    },
                ],
            })
        })

        it('should add calls to caching functions which are connected to cold dsp groups', () => {
            const graph = makeGraph({
                n1: {},
                n2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.nodes.n1.loop = ast`// n1`
            compilation.precompilation.nodes.n2.caching.$0 = ast`// caching n2`
            compilation.precompilation.graph.coldDspGroups = {
                '0': {
                    traversal: ['n1'],
                    outNodesIds: ['n1'],
                    sinkConnections: [
                        [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n2', portletId: '0' },
                        ],
                    ],
                },
            }
            compilation.variableNamesIndex.coldDspGroups.$0 = 'DSP_0'

            const sequence = generateColdDspFunctions(compilation)

            assertAstSequencesAreEqual(normalizeAstSequence(sequence), {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'DSP_0',
                        args: [
                            {
                                astType: 'Var',
                                name: 'm',
                                type: 'Message',
                                value: undefined,
                            },
                        ],
                        returnType: 'void',
                        body: {
                            astType: 'Sequence',
                            content: ['// n1\n// caching n2'],
                        },
                    },
                ],
            })
        })
    })
})
