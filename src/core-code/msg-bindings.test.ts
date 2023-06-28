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
import { liftString } from './core-bindings'
import {
    INT_ARRAY_BYTES_PER_ELEMENT,
    liftMessage,
    lowerMessage,
} from './msg-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    TEST_PARAMETERS,
} from './test-helpers'
import { AudioSettings } from '../types'

describe('msg-bindings', () => {
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

    const baseExports = {
        testReadMessageData: 1,
    }

    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
        getAscCode('core.asc', bitDepth) +
        getAscCode('sked.asc', bitDepth) +
        getAscCode('commons.asc', bitDepth) +
        getAscCode('msg.asc', bitDepth) +
        `
            export function testReadMessageData(message: Message, index: Int): Int {
                return message.dataView.getInt32(index * sizeof<Int>())
            }

            export {
                // MSG EXPORTS
                x_msg_create as msg_create,
                x_msg_getTokenTypes as msg_getTokenTypes,
                x_msg_createTemplate as msg_createTemplate,
                msg_writeStringToken,
                msg_writeFloatToken,
                msg_readStringToken,
                msg_readFloatToken,
                MSG_FLOAT_TOKEN,
                MSG_STRING_TOKEN,

                // CORE EXPORTS
                createFloatArray,
                x_core_createListOfArrays as core_createListOfArrays,
                x_core_pushToListOfArrays as core_pushToListOfArrays,
                x_core_getListOfArraysLength as core_getListOfArraysLength,
                x_core_getListOfArraysElem as core_getListOfArraysElem,
            }
        `

    describe('lowerMessage', () => {
        it.each(TEST_PARAMETERS)(
            'should create the message with correct header and filled-in data %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)

                const exports = baseExports

                const { wasmExports, floatArrayType } =
                    await initializeCoreCodeTest({ code, bitDepth, exports })

                const messagePointer = lowerMessage(wasmExports, ['bla', 2.3])

                // Testing token count
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 0),
                    2
                )

                // Testing token types
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 1),
                    1
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 2),
                    0
                )

                // Testing token positions
                // <Header byte size>
                //      + <Size of f32>
                //      + <Size of 3 chars strings> + <Size of f32>
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 3),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 4),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT + 3 * BYTES_IN_CHAR
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 5),
                    6 * INT_ARRAY_BYTES_PER_ELEMENT +
                        3 * BYTES_IN_CHAR +
                        floatArrayType.BYTES_PER_ELEMENT
                )

                // TOKEN "bla"
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 6),
                    'bla'.charCodeAt(0)
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 7),
                    'bla'.charCodeAt(1)
                )
                assert.strictEqual(
                    wasmExports.testReadMessageData(messagePointer, 8),
                    'bla'.charCodeAt(2)
                )

                // TOKEN "2.3"
                if (bitDepth === 64) {
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 9),
                        float64ToInt32Array(2.3)[0]
                    )
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 10),
                        float64ToInt32Array(2.3)[1]
                    )
                } else {
                    assert.strictEqual(
                        wasmExports.testReadMessageData(messagePointer, 9),
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
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                export function testCreateMessage(): Message {
                    const message: Message = msg_create([
                        MSG_STRING_TOKEN, 5,
                        MSG_FLOAT_TOKEN,
                    ])
                    msg_writeStringToken(message, 0, "hello")
                    msg_writeFloatToken(message, 1, 666)
                    return message
                }
            `

                const exports = {
                    ...baseExports,
                    testCreateMessage: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const messagePointer = wasmExports.testCreateMessage()
                assert.deepStrictEqual(
                    liftMessage(wasmExports, messagePointer),
                    ['hello', 666]
                )
            }
        )
    })

    describe('msg_floats / msg_strings', () => {
        it.each(TEST_PARAMETERS)(
            'should create floats message %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                export function testCreateFloatsMessage(): Message {
                    return msg_floats([111, 222])
                }
                export function testCreateEmptyFloatsMessage(): Message {
                    return msg_floats([])
                }
            `

                const exports = {
                    ...baseExports,
                    testCreateFloatsMessage: 1,
                    testCreateEmptyFloatsMessage: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                assert.deepStrictEqual(
                    liftMessage(
                        wasmExports,
                        wasmExports.testCreateFloatsMessage()
                    ),
                    [111, 222]
                )
                assert.deepStrictEqual(
                    liftMessage(
                        wasmExports,
                        wasmExports.testCreateEmptyFloatsMessage()
                    ),
                    []
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should create strings message %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                export function testCreateStringsMessage(): Message {
                    return msg_strings(['', 'blabla', 'blo'])
                }
                export function testCreateEmptyStringsMessage(): Message {
                    return msg_strings([])
                }
            `

                const exports = {
                    ...baseExports,
                    testCreateStringsMessage: 1,
                    testCreateEmptyStringsMessage: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                assert.deepStrictEqual(
                    liftMessage(
                        wasmExports,
                        wasmExports.testCreateStringsMessage()
                    ),
                    ['', 'blabla', 'blo']
                )
                assert.deepStrictEqual(
                    liftMessage(
                        wasmExports,
                        wasmExports.testCreateEmptyStringsMessage()
                    ),
                    []
                )
            }
        )
    })

    describe('msg_isMatching', () => {
        it.each(TEST_PARAMETERS)(
            'should match given message %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                export function testMatch1(): boolean {
                    const m: Message = msg_create([MSG_FLOAT_TOKEN])
                    return msg_isMatching(m, [MSG_FLOAT_TOKEN])
                }
                export function testMatch2(): boolean {
                    const m: Message = msg_create([MSG_STRING_TOKEN, 1])
                    return msg_isMatching(m, [MSG_STRING_TOKEN])
                }
                export function testMatch3(): boolean {
                    const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 1, MSG_FLOAT_TOKEN])
                    return msg_isMatching(m, [MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, MSG_FLOAT_TOKEN])
                }
                export function testMatch4(): boolean {
                    const m: Message = msg_create([])
                    return msg_isMatching(m, [])
                }
                export function testNotMatching1(): boolean {
                    const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_FLOAT_TOKEN])
                    return msg_isMatching(m, [MSG_FLOAT_TOKEN])
                }
                export function testNotMatching2(): boolean {
                    const m: Message = msg_create([MSG_STRING_TOKEN, 1])
                    return msg_isMatching(m, [MSG_FLOAT_TOKEN])
                }
            `

                const exports = {
                    ...baseExports,
                    testMatch1: 1,
                    testMatch2: 1,
                    testMatch3: 1,
                    testMatch4: 1,
                    testNotMatching1: 1,
                    testNotMatching2: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                assert.ok(wasmExports.testMatch1())
                assert.ok(wasmExports.testMatch2())
                assert.ok(wasmExports.testMatch3())
                assert.ok(wasmExports.testMatch4())
                assert.ok(!wasmExports.testNotMatching1())
                assert.ok(!wasmExports.testNotMatching2())
            }
        )
    })

    describe('msg_display', () => {
        it.each(TEST_PARAMETERS)(
            'should return a display version of a message %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode(bitDepth) + `
                export function testDisplay(): string {
                    const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 3])
                    msg_writeFloatToken(m, 0, -123)
                    msg_writeStringToken(m, 1, 'bla')
                    return msg_display(m)
                }
            `

                const exports = {
                    ...baseExports,
                    testDisplay: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                assert.strictEqual(
                    liftString(wasmExports, wasmExports.testDisplay()),
                    '[-123.0, "bla"]'
                )
            }
        )
    })
})