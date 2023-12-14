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
import { AnonFunc, Func, Var, ast } from '../ast/declare'
import {
    assertAstSequencesAreEqual,
    normalizeAstSequence,
} from '../ast/test-helpers'
import {
    generateIoMessageReceivers,
    generateLoop,
    generateNodeInitializations,
    generatePortletsDeclarations,
} from './generate'
import { AstSequence } from '../ast/types'

describe('generate', () => {
    describe('generateNodePortletsDeclarations', () => {
        const MESSAGE_RECEIVER_FUNC = AnonFunc([Var('Message', 'm')])``

        it('should compile declarations for signal outlets', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.traversals.all = ['node1', 'node2']
            compilation.precompilation.nodes.node1.signalOuts['0'] =
                'node1_OUTS_0'
            compilation.precompilation.nodes.node1.signalOuts['1'] =
                'node1_OUTS_1'
            compilation.precompilation.nodes.node2.signalOuts['0'] =
                'node2_OUTS_0'

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    Var('Float', 'node1_OUTS_0', '0'),
                    Var('Float', 'node1_OUTS_1', '0'),
                    Var('Float', 'node2_OUTS_0', '0'),
                ],
            })
        })

        it('should compile node message receivers', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.traversals.all = ['node1', 'node2']
            compilation.precompilation.nodes.node1.messageReceivers['0'] = Func(
                'node1_RCVS_0',
                [Var('Message', 'm')]
            )`// [node1] message receiver 0`
            compilation.precompilation.nodes.node1.messageReceivers['1'] = Func(
                'node1_RCVS_1',
                [Var('Message', 'm')]
            )`// [node1] message receiver 1`
            compilation.precompilation.nodes.node2.messageReceivers['0'] = Func(
                'node2_RCVS_0',
                [Var('Message', 'm')]
            )`// [node2] message receiver 0`

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node1_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [node1] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "node1", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node1_RCVS_1',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [node1] message receiver 1\n' +
                                    `throw new Error('[DUMMY], id "node1", inlet "1", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node2_RCVS_0',
                        body: {
                            astType: 'Sequence',
                            content: [
                                '// [node2] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "node2", inlet "0", unsupported message : ' + msg_display(m))`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should render correct error throw if debug = true', () => {
            const graph = makeGraph({
                node1: {},
            })

            const compilation = makeCompilation({
                graph,
                settings: { debug: true },
            })

            compilation.precompilation.traversals.all = ['node1']
            compilation.precompilation.nodes.node1.messageReceivers['0'] = Func(
                'node1_RCVS_0',
                [Var('Message', 'm')]
            )`// [node1] message receiver 0`

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'node1_RCVS_0',
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
                                '// [node1] message receiver 0\n' +
                                    `throw new Error('[DUMMY], id "node1", inlet "0", unsupported message : ' + msg_display(m) + '\\nDEBUG : remember, you must return from message receiver')`,
                            ],
                        },
                    },
                ],
            })
        })

        it('should compile node message senders', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
                node3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.traversals.all = [
                'node1',
                'node2',
                'node3',
            ]
            compilation.precompilation.nodes.node1.messageSenders['0'] = {
                messageSenderName: 'node1_SNDS_0',
                messageReceiverNames: ['node2_RCVS_0', 'node2_RCVS_1'],
            }
            compilation.precompilation.nodes.node1.messageSenders['1'] = {
                messageSenderName: 'node1_SNDS_1',
                messageReceiverNames: ['outlerListener_node1_0'],
            }
            compilation.precompilation.nodes.node2.messageSenders['0'] = {
                messageSenderName: 'node2_SNDS_0',
                messageReceiverNames: ['node3_RCVS_0'],
            }

            const sequence = generatePortletsDeclarations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node1_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['node2_RCVS_0(m)\nnode2_RCVS_1(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node1_SNDS_1',
                        body: {
                            astType: 'Sequence',
                            content: ['outlerListener_node1_0(m)'],
                        },
                    },
                    {
                        ...MESSAGE_RECEIVER_FUNC,
                        name: 'node2_SNDS_0',
                        body: {
                            astType: 'Sequence',
                            content: ['node3_RCVS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('generateNodeInitializations', () => {
        it('should generate initializations for nodes', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            compilation.precompilation.traversals.all = ['node1', 'node2']
            compilation.precompilation.nodes.node1.initialization = ast`
                ${Var('Float', 'node1', '0')}
                console.log(node1)
            `
            compilation.precompilation.nodes.node2.initialization = ast``

            const sequence = generateNodeInitializations(compilation)

            assertAstSequencesAreEqual(sequence, {
                astType: 'Sequence',
                content: [Var('Float', 'node1', '0'), 'console.log(node1)'],
            })
        })
    })

    describe('generateIoMessageReceivers', () => {
        it('should compile declared inlet callers', () => {
            const graph = makeGraph({
                node1: {
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
                        messageReceivers: { node1: { portletIds: ['0'] } },
                        messageSenders: {},
                    }
                },
                nodeImplementations,
            })

            precompile(compilation)

            const sequence = generateIoMessageReceivers(compilation)

            assert.deepStrictEqual<AstSequence>(sequence, {
                astType: 'Sequence',
                content: [
                    {
                        astType: 'Func',
                        name: 'ioRcv_node1_0',
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
                            content: ['node1_RCVS_0(m)'],
                        },
                    },
                ],
            })
        })
    })

    describe('generateLoop', () => {
        it('should compile the loop function', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
                node3: {},
            })

            const compilation = makeCompilation({
                graph,
            })

            ;(compilation.precompilation.traversals.loop = [
                'node1',
                'node2',
                'node3',
            ]),
                (compilation.precompilation.nodes.node1.loop = ast`// [osc~] : frequency 440`)
            compilation.precompilation.nodes.node2.loop = ast`// [+~] : value 110`
            compilation.precompilation.nodes.node3.loop = ast`// [dac~] : channelCount 2`

            const sequence = generateLoop(compilation)

            assert.deepStrictEqual<AstSequence>(
                normalizeAstSequence(sequence),
                {
                    astType: 'Sequence',
                    content: [
                        `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                            '// [osc~] : frequency 440\n' +
                            '// [+~] : value 110\n' +
                            '// [dac~] : channelCount 2\n' +
                            `FRAME++\n}`,
                    ],
                }
            )
        })
    })
})
