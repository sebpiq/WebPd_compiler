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

import { DspGraph } from './dsp-graph'
import { nodeDefaults } from './dsp-graph/test-helpers'
import * as nodeImplementationsTestHelpers from './test-helpers-node-implementations'
import { CompilerTarget, NodeImplementation } from './types'

const TEST_PARAMETERS: Array<{ target: CompilerTarget }> = [
    { target: 'javascript' },
    { target: 'assemblyscript' },
]

describe('test-helpers-node-implementations', () => {
    describe('assertNodeOutput', () => {
        it.each(TEST_PARAMETERS)(
            'should work with signal inlets %s',
            async ({ target }) => {
                const nodeImplementation: NodeImplementation<{}> = {
                    loop: ({ ins, outs }) => `${outs.$0} = ${ins.$0} + 0.1`,
                }

                const node: DspGraph.Node = {
                    ...nodeDefaults('someNode', 'counter'),
                    inlets: { '0': { id: '0', type: 'signal' } },
                    outlets: { '0': { id: '0', type: 'signal' } },
                }

                await nodeImplementationsTestHelpers.assertNodeOutput(
                    {
                        bitDepth: 32,
                        target,
                        node,
                        nodeImplementation,
                    },
                    [{ ins: { '0': 1 } }, { outs: { '0': 1.1 } }],
                    [{ ins: { '0': 2 } }, { outs: { '0': 2.1 } }],
                    [{ ins: { '0': 3 } }, { outs: { '0': 3.1 } }]
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should work with message inlets %s',
            async ({ target }) => {
                const nodeImplementation: NodeImplementation<{}> = {
                    messages: ({ globs, snds }) => ({
                        '0': `
                        ${snds.$0}(
                            msg_floats([
                                msg_readFloatToken(${globs.m}, 0) + 0.1
                            ])
                        )
                        return
                    `,
                    }),
                }

                const node: DspGraph.Node = {
                    ...nodeDefaults('someNode', 'counter'),
                    inlets: { '0': { id: '0', type: 'message' } },
                    outlets: { '0': { id: '0', type: 'message' } },
                }

                await nodeImplementationsTestHelpers.assertNodeOutput(
                    {
                        bitDepth: 64,
                        target,
                        node,
                        nodeImplementation,
                    },
                    [{ ins: { '0': [[1]] } }, { outs: { '0': [[1.1]] } }],
                    [{ ins: { '0': [[2]] } }, { outs: { '0': [[2.1]] } }],
                    [{ ins: { '0': [[3]] } }, { outs: { '0': [[3.1]] } }]
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should send message at the right frame %s',
            async ({ target }) => {
                const nodeImplementation: NodeImplementation<{}> = {
                    messages: ({ globs, snds }) => ({
                        '0': `
                        ${snds.$0}(
                            msg_floats([toFloat(${globs.frame})])
                        )
                        return
                    `,
                    }),
                }

                const node: DspGraph.Node = {
                    ...nodeDefaults('someNode', 'counter'),
                    inlets: { '0': { id: '0', type: 'message' } },
                    outlets: { '0': { id: '0', type: 'message' } },
                }

                await nodeImplementationsTestHelpers.assertNodeOutput(
                    {
                        bitDepth: 32,
                        target,
                        node,
                        nodeImplementation,
                    },
                    [{ ins: { '0': [['bang']] } }, { outs: { '0': [[0]] } }],
                    [{ ins: { '0': [['bang']] } }, { outs: { '0': [[1]] } }],
                    [{ ins: { '0': [['bang']] } }, { outs: { '0': [[2]] } }]
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should handle tests with fs %s',
            async ({ target }) => {
                const nodeImplementation: NodeImplementation<{}> = {
                    messages: ({}) => ({
                        '0': `
                        fs_readSoundFile('/bla', {
                            channelCount: 11,
                            sampleRate: 666,
                            bitDepth: 12,
                            encodingFormat: 'bla',
                            endianness: 'l',
                            extraOptions: 'bli',
                        }, () => {})
                        return
                    `,
                    }),
                }

                const node: DspGraph.Node = {
                    ...nodeDefaults('someNode', 'DUMMY'),
                    inlets: { '0': { id: '0', type: 'message' } },
                }

                await nodeImplementationsTestHelpers.assertNodeOutput(
                    {
                        bitDepth: 64,
                        target,
                        node,
                        nodeImplementation,
                    },
                    [
                        { ins: { '0': [['bang']] } },
                        {
                            outs: {},
                            fs: {
                                onReadSoundFile: [
                                    1,
                                    '/bla',
                                    [11, 666, 12, 'bla', 'l', 'bli'],
                                ],
                            },
                        },
                    ]
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should handle tests on arrays %s',
            async ({ target }) => {
                const nodeImplementation: NodeImplementation<{}> = {
                    messages: () => ({
                        '0': `
                        commons_getArray('array1')[0] = 666
                        return
                    `,
                    }),
                }

                const node: DspGraph.Node = {
                    ...nodeDefaults('someNode', 'DUMMY'),
                    inlets: { '0': { id: '0', type: 'message' } },
                }

                await nodeImplementationsTestHelpers.assertNodeOutput(
                    {
                        bitDepth: 32,
                        target,
                        node,
                        nodeImplementation,
                        arrays: {
                            array1: [111],
                        },
                    },
                    [{ ins: { '0': [['bang']] } }, { outs: {} }],
                    [
                        { commons: { getArray: ['array1'] } },
                        { outs: {}, commons: { getArray: { array1: [666] } } },
                    ]
                )
            }
        )
    })

    describe('assertSharedCodeFunctionOutput', () => {
        it.each(TEST_PARAMETERS)(
            'should be able to test functions with numbers %s',
            async ({ target }) => {
                await nodeImplementationsTestHelpers.assertSharedCodeFunctionOutput(
                    {
                        bitDepth: 32,
                        target,
                        sharedCodeGenerators: [
                            ({ macros: { Var, Func } }) => `
                        function myNumberFunction ${Func(
                            [
                                Var('someNumber', 'Float'),
                                Var('someOtherNumber', 'Float'),
                            ],
                            'Float'
                        )} {
                            return someNumber + someOtherNumber
                        }
                    `,
                        ],
                        functionName: 'myNumberFunction',
                    },
                    { parameters: [123, 0.5], returns: 123.5 }
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should be able to test functions with messages %s',
            async ({ target }) => {
                await nodeImplementationsTestHelpers.assertSharedCodeFunctionOutput(
                    {
                        bitDepth: 32,
                        target,
                        sharedCodeGenerators: [
                            ({ macros: { Var, Func } }) => `
                        function myMessageFunction ${Func(
                            [Var('someMessage', 'Message')],
                            'Message'
                        )} {
                            const ${Var(
                                'newMessage',
                                'Message'
                            )} = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 3])
                            msg_writeFloatToken(newMessage, 0, msg_readFloatToken(someMessage, 0) + 0.5)
                            msg_writeStringToken(newMessage, 1, msg_readStringToken(someMessage, 1) + 'a')
                            return newMessage
                        }
                    `,
                        ],
                        functionName: 'myMessageFunction',
                    },
                    { parameters: [[-10, 'bl']], returns: [-9.5, 'bla'] }
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should be able to test functions with strings %s',
            async ({ target }) => {
                await nodeImplementationsTestHelpers.assertSharedCodeFunctionOutput(
                    {
                        bitDepth: 32,
                        target,
                        sharedCodeGenerators: [
                            ({ macros: { Var, Func } }) => `
                        function myStringFunction ${Func(
                            [Var('someString', 'string')],
                            'string'
                        )} {
                            return someString + '666'
                        }
                    `,
                        ],
                        functionName: 'myStringFunction',
                    },
                    { parameters: ['hello '], returns: 'hello 666' }
                )
            }
        )
    })
})
