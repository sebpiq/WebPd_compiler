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

import assert from 'assert'
import { jest } from '@jest/globals'
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { compileWasmModule, getAssemblyscriptCoreCode } from './test-helpers'
import {
    INT_ARRAY_BYTES_PER_ELEMENT,
    createEngine,
    lowerString,
    EngineSettings,
} from './assemblyscript-wasm-bindings'
import {
    Code,
    Compilation,
    PortSpecs,
} from '../types'
import compileToAssemblyscript, {
    compilePorts,
} from './compile-to-assemblyscript'
import { makeCompilation, round } from '../test-helpers'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import MACROS from './macros'

describe('AssemblyScriptWasmEngine', () => {
    jest.setTimeout(10000)

    const ASSEMBLY_SCRIPT_CORE_CODE = getAssemblyscriptCoreCode()

    const ENGINE_SETTINGS: EngineSettings = {
        audioSettings: {
            bitDepth: 32,
            channelCount: 2,
        },
    }

    const float64ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat64(0, value)
        return [dataView.getInt32(0), dataView.getInt32(4)]
    }

    const getEngine = async (code: Code) => {
        const buffer = await compileWasmModule(code)
        const engine = await createEngine(buffer, ENGINE_SETTINGS)
        const wasmExports = engine.wasmExports as any
        return { engine, wasmExports }
    }

    describe('configure/loop', () => {
        it('should configure and return an output block of the right size', async () => {
            let block: Float32Array | Float64Array
            const compilation = makeCompilation({ macros: MACROS })
            const { engine: engine2Channels } = await getEngine(
                compileToAssemblyscript({
                    ...compilation,
                    audioSettings: {
                        ...compilation.audioSettings,
                        channelCount: 2,
                    }
                })
            )
            engine2Channels.configure(44100, 4)
            block = engine2Channels.loop()
            assert.strictEqual(block.length, 4 * 2)

            const { engine: engine3Channels } = await getEngine(
                compileToAssemblyscript({
                    ...compilation,
                    audioSettings: {
                        ...compilation.audioSettings,
                        channelCount: 3
                    }
                })
            )
            engine3Channels.configure(48000, 5)
            block = engine3Channels.loop()
            assert.strictEqual(block.length, 3 * 5)
        })
    })

    describe('ports', () => {
        const getEngine = async (portSpecs: PortSpecs, extraCode: Code) => {
            const engineSettings: EngineSettings = {
                ...ENGINE_SETTINGS,
                portSpecs,
            }
            const code =
                ASSEMBLY_SCRIPT_CORE_CODE +
                extraCode +
                `
                ${compilePorts(portSpecs, {
                    FloatType: 'f32',
                })}
            `
            const buffer = await compileWasmModule(code)
            const engine = await createEngine(buffer, engineSettings)
            return engine
        }

        it('should generate port to read message arrays', async () => {
            const portSpecs: PortSpecs = {
                someMessageArray: {
                    type: 'messages',
                    access: 'r',
                },
            }
            const engine = await getEngine(
                portSpecs,
                `
                const someMessageArray: Message[] = []
                const m1 = Message.fromTemplate([
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                ])
                const m2 = Message.fromTemplate([
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 3,
                    ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                ])
                writeFloatDatum(m1, 0, 666.5)
                writeStringDatum(m2, 0, 'bla')
                writeFloatDatum(m2, 1, 123)
                someMessageArray.push(m1)
                someMessageArray.push(m2)
            `
            )
            assert.deepStrictEqual(Object.keys(engine.ports).sort(), [
                'read_someMessageArray',
            ])
            assert.deepStrictEqual(engine.ports.read_someMessageArray(), [
                [666.5],
                ['bla', 123],
            ])
        })

        it('should generate port to write message arrays', async () => {
            const portSpecs: PortSpecs = {
                someMessageArray: {
                    type: 'messages',
                    access: 'rw',
                },
            }
            const engine = await getEngine(
                portSpecs,
                `
                let someMessageArray: Message[] = []
            `
            )
            assert.deepStrictEqual(Object.keys(engine.ports).sort(), [
                'read_someMessageArray',
                'write_someMessageArray',
            ])
            engine.ports.write_someMessageArray([[777, 'hello'], [111]])
            assert.deepStrictEqual(engine.ports.read_someMessageArray(), [
                [777, 'hello'],
                [111],
            ])
        })

        it('should generate port to read floats', async () => {
            const portSpecs: PortSpecs = {
                someFloat: {
                    type: 'float',
                    access: 'r',
                },
            }
            const engine = await getEngine(
                portSpecs,
                `
                const someFloat: f32 = 999
            `
            )
            assert.deepStrictEqual(Object.keys(engine.ports).sort(), [
                'read_someFloat',
            ])
            assert.strictEqual(engine.ports.read_someFloat(), 999)
        })

        it('should generate port to write floats', async () => {
            const portSpecs: PortSpecs = {
                someFloat: {
                    type: 'float',
                    access: 'rw',
                },
            }
            const engine = await getEngine(
                portSpecs,
                `
                let someFloat: f32 = 456
            `
            )
            assert.deepStrictEqual(Object.keys(engine.ports).sort(), [
                'read_someFloat',
                'write_someFloat',
            ])
            engine.ports.write_someFloat(666)
            assert.strictEqual(engine.ports.read_someFloat(), 666)
        })
    })

    describe('setArray', () => {
        it('should set the array', async () => {
            const compilation: Compilation = makeCompilation({ macros: MACROS })
            const { engine, wasmExports } = await getEngine(
                compileToAssemblyscript(compilation) +
                    `
                export function testReadArray (arrayName: string, index: i32): f64 {
                    return ARRAYS[arrayName][index]
                }
            `
            )

            engine.setArray('array1', new Float32Array([11.1, 22.2, 33.3]))
            engine.setArray('array2', new Float64Array([44.4, 55.5]))
            engine.setArray('array3', [66.6, 77.7])

            let actual: number
            actual = wasmExports.testReadArray(lowerString(engine.wasmExports, 'array1'), 1)
            assert.strictEqual(round(actual), 22.2)
            actual = wasmExports.testReadArray(lowerString(engine.wasmExports, 'array2'), 0)
            assert.strictEqual(round(actual), 44.4)
            actual = wasmExports.testReadArray(lowerString(engine.wasmExports, 'array3'), 1)
            assert.strictEqual(round(actual), 77.7)
        })
    })

    describe('lowerArrayBufferOfIntegers', () => {
        it('should correctly lower the given array to an ArrayBuffer of integers', async () => {
            const { engine, wasmExports } = await getEngine(`
                export function testReadArrayBufferOfIntegers(buffer: ArrayBuffer, index: i32): i32 {
                    const dataView = new DataView(buffer)
                    return dataView.getInt32(index * sizeof<i32>())
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)

            const bufferPointer = engine.lowerArrayBufferOfIntegers([
                1, 22, 333, 4444,
            ])

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
            const { engine, wasmExports } = await getEngine(`
                export function testReadMessageData(message: Message, index: i32): i32 {
                    return message.dataView.getInt32(index * sizeof<i32>())
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)

            const messagePointer = engine.lowerMessage(['bla', 2.3])

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
            const { engine, wasmExports } = await getEngine(`
                export function testCreateMessage(): Message {
                    const message: Message = Message.fromTemplate([
                        MESSAGE_DATUM_TYPE_STRING, 5,
                        MESSAGE_DATUM_TYPE_FLOAT,
                    ])
                    writeStringDatum(message, 0, "hello")
                    writeFloatDatum(message, 1, 666)
                    return message
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)
            const messagePointer = wasmExports.testCreateMessage()
            assert.deepStrictEqual(engine.liftMessage(messagePointer), [
                'hello',
                666,
            ])
        })
    })

    describe('createMessageArray / pushMessageToArray', () => {
        it('should create message array and push message to array', async () => {
            const { engine, wasmExports } = await getEngine(`
                export function testMessageArray(messageArray: Message[], index: i32): Message {
                    return messageArray[index]
                }
                export function testReadMessageData(message: Message, index: i32): i32 {
                    return message.dataView.getInt32(index * sizeof<i32>())
                }
                ${ASSEMBLY_SCRIPT_CORE_CODE}
            `)

            const messagePointer1 = engine.lowerMessage(['\x00\x00'])
            const messagePointer2 = engine.lowerMessage([0])

            const messageArrayPointer = wasmExports.createMessageArray()
            wasmExports.pushMessageToArray(messageArrayPointer, messagePointer1)
            wasmExports.pushMessageToArray(messageArrayPointer, messagePointer2)

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

    describe('message listeners', () => {
        it('should call message listener when new message sent to inlet', async () => {
            const called: Array<Array<PdSharedTypes.ControlValue>> = []
            const buffer = await compileWasmModule(`
                ${ASSEMBLY_SCRIPT_CORE_CODE}
                const bla: Message[] = [
                    Message.fromTemplate([
                        ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                            MESSAGE_DATUM_TYPE_FLOAT
                        ]},
                        ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                            MESSAGE_DATUM_TYPE_FLOAT
                        ]}
                    ]),
                    Message.fromTemplate([
                        ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                            MESSAGE_DATUM_TYPE_STRING
                        ]}, 2
                    ]),
                ]
                writeFloatDatum(bla[0], 0, 123)
                writeFloatDatum(bla[0], 1, 456)
                writeStringDatum(bla[1], 0, 'oh')
                export declare function messageListener_bla(): void

                export function read_bla_length(): i32 { 
                    return bla.length
                }

                export function read_bla_elem(index: i32): Message { 
                    return bla[index]
                }

                export function notify_bla(): void {
                    messageListener_bla()
                }
            `)
            const engine = await createEngine(buffer, {
                ...ENGINE_SETTINGS,
                messageListenerSpecs: {
                    'bla': (messages: Array<PdSharedTypes.ControlValue>) => called.push(messages)
                },
                portSpecs: {
                    'bla': {type: 'messages', access: 'r'}
                }
            })
            ;(engine.wasmExports as any).notify_bla()
            assert.deepStrictEqual(called, [
                [[123, 456], ['oh']]
            ])
            const wasmExports = engine.wasmExports as any
            return { engine, wasmExports }
        })
    })
})
