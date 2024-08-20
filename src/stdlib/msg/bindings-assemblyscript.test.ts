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
    INT_ARRAY_BYTES_PER_ELEMENT,
    MsgRawModuleWithDependencies,
    liftMessage,
    lowerMessage,
} from './bindings-assemblyscript'
import { AudioSettings } from '../../compile/types'
import {
    TEST_PARAMETERS,
    ascCodeToRawModule,
} from '../../engine-assemblyscript/run/test-helpers'
import { getFloatArrayType } from '../../run/run-helpers'
import { core } from '../core/core'
import { sked } from '../sked/sked'
import { msg } from './msg'
import { MessagePointer } from '../../engine-assemblyscript/run/types'
import { Sequence } from '../../ast/declare'
import render from '../../compile/render'
import macros from '../../engine-assemblyscript/compile/macros'
import {
    makeGlobalCodePrecompilationContext,
    makePrecompilation,
} from '../../compile/test-helpers'
import { Code } from '../../ast/types'
import { instantiateAndDedupeDependencies } from '../../compile/precompile/dependencies'
import { CoreNamespaceAll } from '../core/types'
import { MsgNamespaceAll } from './types'
import { SkedNamespaceAll } from '../sked/types'
import { proxyWithEngineNameMapping } from '../../run/run-helpers'

describe('msg-bindings', () => {
    interface MsgTestRawModule {
        testReadMessageData: (message: MessagePointer, index: number) => number
        testCreateMessage: () => MessagePointer
    }

    const BYTES_IN_CHAR = 4

    const float64ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat64(0, value)
        return [dataView.getInt32(0), dataView.getInt32(4)]
    }

    const float32ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat32(0, value)
        return [dataView.getInt32(0)]
    }

    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) => {
        const precompilation = makePrecompilation({
            settings: {
                target: 'assemblyscript',
                audio: {
                    bitDepth,
                    channelCount: { in: 2, out: 2 },
                },
            },
        })
        const globals = precompilation.variableNamesAssigner.globals
        const globalContext =
            makeGlobalCodePrecompilationContext(precompilation)
        return render(
            macros,
            Sequence([
                core.code(
                    { ns: globals.core as CoreNamespaceAll },
                    globalContext
                ),
                sked.code(
                    { ns: globals.sked as SkedNamespaceAll },
                    globalContext
                ),
                msg.code({ ns: globals.msg as MsgNamespaceAll }, globalContext),
                `export function testReadMessageData(message: ${globals.msg.Message}, index: Int): Int {
                    return message.dataView.getInt32(index * sizeof<Int>())
                }`,
                core.exports!(
                    {
                        ns: precompilation.variableNamesAssigner.globals
                            .core as CoreNamespaceAll,
                    },
                    globalContext
                ).map((name) => `export { ${name} }`),
                msg.exports!(
                    {
                        ns: precompilation.variableNamesAssigner.globals
                            .msg as MsgNamespaceAll,
                    },
                    globalContext
                ).map((name) => `export { ${name} }`),
            ])
        )
    }

    const compileRawModule = async (
        code: Code,
        bitDepth: AudioSettings['bitDepth']
    ) => {
        const rawModule = await ascCodeToRawModule<MsgTestRawModule>(
            code,
            bitDepth
        )
        const precompilation = makePrecompilation({
            settings: {
                target: 'assemblyscript',
            },
        })
        // We instantiate the code to make sure all names are assigned
        instantiateAndDedupeDependencies(
            [msg],
            precompilation.variableNamesAssigner,
            makeGlobalCodePrecompilationContext(precompilation)
        )
        return proxyWithEngineNameMapping(
            rawModule,
            precompilation.variableNamesIndex
        ) as MsgTestRawModule & MsgRawModuleWithDependencies
    }

    describe('lowerMessage', () => {
        it.each(TEST_PARAMETERS)(
            'should create the message with correct header and filled-in data %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const floatArrayType = getFloatArrayType(bitDepth)
                const rawModule = await compileRawModule(code, bitDepth)
                const messagePointer = lowerMessage(rawModule, ['bla', 2.3])

                // Testing token count
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 0),
                    2
                )

                // Testing token types
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 1),
                    1
                )
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 2),
                    0
                )

                // Testing token positions
                // <Header byte size>
                //      + <Size of f32>
                //      + <Size of 3 chars strings> + <Size of f32>
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 3),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT
                )
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 4),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT + 3 * BYTES_IN_CHAR
                )
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 5),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT +
                        3 * BYTES_IN_CHAR +
                        floatArrayType.BYTES_PER_ELEMENT
                )

                // TOKEN "bla"
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 6),
                    'bla'.charCodeAt(0)
                )
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 7),
                    'bla'.charCodeAt(1)
                )
                assert.strictEqual(
                    rawModule.testReadMessageData(messagePointer, 8),
                    'bla'.charCodeAt(2)
                )

                // TOKEN "2.3"
                if (bitDepth === 64) {
                    assert.strictEqual(
                        rawModule.testReadMessageData(messagePointer, 9),
                        float64ToInt32Array(2.3)[0]
                    )
                    assert.strictEqual(
                        rawModule.testReadMessageData(messagePointer, 10),
                        float64ToInt32Array(2.3)[1]
                    )
                } else {
                    assert.strictEqual(
                        rawModule.testReadMessageData(messagePointer, 9),
                        float32ToInt32Array(2.3)[0]
                    )
                }
            }
        )
    })

    describe('liftMessage', () => {
        it.each(TEST_PARAMETERS)(
            'should read message to a JavaScript array %s',
            async ({ bitDepth }) => {
                const precompilation = makePrecompilation({})
                const globals = precompilation.variableNamesAssigner.globals

                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                    export function testCreateMessage(): ${globals.msg.Message} {
                        const message: ${globals.msg.Message} = ${globals.msg.create}([
                            ${globals.msg.STRING_TOKEN}, 5,
                            ${globals.msg.FLOAT_TOKEN},
                        ])
                        ${globals.msg.writeStringToken}(message, 0, "hello")
                        ${globals.msg.writeFloatToken}(message, 1, 666)
                        return message
                    }
                `

                const rawModule = await compileRawModule(code, bitDepth)

                const messagePointer = rawModule.testCreateMessage()
                assert.deepStrictEqual(liftMessage(rawModule, messagePointer), [
                    'hello',
                    666,
                ])
            }
        )
    })
})
