/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from "assert"
import { INT_ARRAY_BYTES_PER_ELEMENT, liftMessage, lowerArrayBufferOfIntegers, lowerMessage } from "./msg-bindings"
import { getAscCode, getWasmExports } from "./test-helpers"

describe('msg-bindings', () => {
    
    const MSG_ASC_CODE = getAscCode('msg.asc')

    const float64ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat64(0, value)
        return [dataView.getInt32(0), dataView.getInt32(4)]
    }

    describe('lowerArrayBufferOfIntegers', () => {
        it('should correctly lower the given array to an ArrayBuffer of integers', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                MSG_ASC_CODE + `
                    export function testReadArrayBufferOfIntegers(buffer: ArrayBuffer, index: i32): i32 {
                        const dataView = new DataView(buffer)
                        return dataView.getInt32(index * sizeof<i32>())
                    }
                `
            )

            const bufferPointer = lowerArrayBufferOfIntegers(
                wasmExports,
                [1, 22, 333, 4444]
            )

            assert.strictEqual(
                wasmExports.testReadArrayBufferOfIntegers(bufferPointer, 0),
                1
            )
            assert.strictEqual(
                wasmExports.testReadArrayBufferOfIntegers(bufferPointer, 1),
                22
            )
            assert.strictEqual(
                wasmExports.testReadArrayBufferOfIntegers(bufferPointer, 2),
                333
            )
            assert.strictEqual(
                wasmExports.testReadArrayBufferOfIntegers(bufferPointer, 3),
                4444
            )
        })
    })

    describe('lowerMessage', () => {
        it('should create the message with correct header and filled-in data', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                MSG_ASC_CODE + `
                    export function testReadMessageData(message: Message, index: i32): i32 {
                        return message.dataView.getInt32(index * sizeof<i32>())
                    }
                `
            )

            const messagePointer = lowerMessage(wasmExports, ['bla', 2.3])

            // Testing datum count
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 0),
                2
            )

            // Testing datum types
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 1),
                1
            )
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 2),
                0
            )

            // Testing datum positions
            // <Header byte size>
            //      + <Size of f32>
            //      + <Size of 3 chars strings> + <Size of f32>
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 3),
                6 * INT_ARRAY_BYTES_PER_ELEMENT
            )
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 4),
                6 * INT_ARRAY_BYTES_PER_ELEMENT + 3 * 4 // 4 = number of bytes in char
            )
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 5),
                6 * INT_ARRAY_BYTES_PER_ELEMENT +
                    3 * 4 +
                    Float64Array.BYTES_PER_ELEMENT
            )

            // DATUM "bla"
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

            // DATUM "2.3"
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 9),
                float64ToInt32Array(2.3)[0]
            )
            assert.strictEqual(
                wasmExports.testReadMessageData(messagePointer, 10),
                float64ToInt32Array(2.3)[1]
            )
        })
    })

    describe('liftMessage', () => {
        it('should read message to a JavaScript array', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                MSG_ASC_CODE + `
                    export function testCreateMessage(): Message {
                        const message: Message = Message.fromTemplate([
                            MESSAGE_DATUM_TYPE_STRING, 5,
                            MESSAGE_DATUM_TYPE_FLOAT,
                        ])
                        msg_writeStringDatum(message, 0, "hello")
                        msg_writeFloatDatum(message, 1, 666)
                        return message
                    }
                `
            )
            const messagePointer = wasmExports.testCreateMessage()
            assert.deepStrictEqual(liftMessage(wasmExports, messagePointer), [
                'hello',
                666,
            ])
        })
    })

    describe('msg_createArray / msg_pushToArray', () => {
        it('should create message array and push message to array', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                MSG_ASC_CODE + `
                    export function testMessageArray(messageArray: Message[], index: i32): Message {
                        return messageArray[index]
                    }
                    export function testReadMessageData(message: Message, index: i32): i32 {
                        return message.dataView.getInt32(index * sizeof<i32>())
                    }
                `
            )

            const messagePointer1 = lowerMessage(wasmExports, ['\x00\x00'])
            const messagePointer2 = lowerMessage(wasmExports, [0])

            const messageArrayPointer = wasmExports.msg_createArray()
            wasmExports.msg_pushToArray(messageArrayPointer, messagePointer1)
            wasmExports.msg_pushToArray(messageArrayPointer, messagePointer2)

            const messagePointer1Bis: number = wasmExports.testMessageArray(
                messageArrayPointer,
                0
            )
            const messagePointer2Bis: number = wasmExports.testMessageArray(
                messageArrayPointer,
                1
            )

            assert.deepStrictEqual(
                [0, 1, 2, 3, 4, 5].map((i) =>
                    wasmExports.testReadMessageData(messagePointer1Bis, i)
                ),
                [
                    1,
                    wasmExports.MESSAGE_DATUM_TYPE_STRING.valueOf(),
                    INT_ARRAY_BYTES_PER_ELEMENT * 4,
                    INT_ARRAY_BYTES_PER_ELEMENT * 4 + 2 * 4, // 4 bytes per char
                    0,
                    0,
                ]
            )
            assert.deepStrictEqual(
                [0, 1, 2, 3, 4].map((i) =>
                    wasmExports.testReadMessageData(messagePointer2Bis, i)
                ),
                [
                    1,
                    wasmExports.MESSAGE_DATUM_TYPE_FLOAT.valueOf(),
                    INT_ARRAY_BYTES_PER_ELEMENT * 4,
                    INT_ARRAY_BYTES_PER_ELEMENT * 4 +
                        Float64Array.BYTES_PER_ELEMENT,
                    0,
                ]
            )
        })
    })

})