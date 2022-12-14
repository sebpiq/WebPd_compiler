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
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { compileWasmModule } from './test-helpers'
import {
    INT_ARRAY_BYTES_PER_ELEMENT,
    createEngine,
    lowerString,
    BindingsSettings,
    readMetadata,
    liftMessage,
    instantiateWasmModule,
    lowerArrayBufferOfIntegers,
    lowerMessage,
} from './assemblyscript-wasm-bindings'
import {
    Code,
    Compilation,
    AccessorSpecs,
    Message,
    NodeImplementations,
} from '../types'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { makeCompilation, round } from '../test-helpers'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import macros from './macros'
import { EngineMetadata } from './types'
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import { DspGraph } from '@webpd/dsp-graph'

describe('AssemblyScriptWasmEngine', () => {
    const BINDINGS_SETTINGS: BindingsSettings = {}

    const COMPILATION: Compilation = makeCompilation({
        target: 'assemblyscript',
        macros,
        audioSettings: {
            bitDepth: 64,
            channelCount: { in: 2, out: 2 },
        },
    })

    const float64ToInt32Array = (value: number) => {
        const dataView = new DataView(
            new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT)
        )
        dataView.setFloat64(0, value)
        return [dataView.getInt32(0), dataView.getInt32(4)]
    }

    const getWasmExports = async (code: Code) => {
        const buffer = await compileWasmModule(code)
        const wasmInstance = await instantiateWasmModule(buffer)
        return wasmInstance.exports as any
    }

    describe('readMetadata', () => {
        it('should extract the metadata', async () => {
            const accessorSpecs: AccessorSpecs = {
                bla: { access: 'r', type: 'signal' },
            }
            const compilation = makeCompilation({
                ...COMPILATION,
                accessorSpecs,
            })
            const wasmBuffer = await compileWasmModule(
                // prettier-ignore
                compileToAssemblyscript(compilation) + `
                    let bla: f32 = 1
                `
            )
            const metadata = await readMetadata(wasmBuffer)

            assert.deepStrictEqual(metadata, {
                compilation: {
                    audioSettings: compilation.audioSettings,
                    accessorSpecs,
                    inletListenerSpecs: compilation.inletListenerSpecs,
                    engineVariableNames: compilation.engineVariableNames,
                },
            } as EngineMetadata)
        })
    })

    describe('lowerArrayBufferOfIntegers', () => {
        it('should correctly lower the given array to an ArrayBuffer of integers', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                compileToAssemblyscript(COMPILATION) + `
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
                compileToAssemblyscript(COMPILATION) + `
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
                compileToAssemblyscript(COMPILATION) + `
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
                compileToAssemblyscript(COMPILATION) + `
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

    describe('AssemblyScriptWasmEngine', () => {
        const getEngine = async (
            code: Code,
            bindingsSettings: BindingsSettings = BINDINGS_SETTINGS
        ) => {
            const buffer = await compileWasmModule(code)
            const engine = await createEngine(buffer, bindingsSettings)
            const wasmExports = engine.wasmExports as any
            return { engine, wasmExports }
        }

        describe('metadata', () => {
            it('should attach the metadata to the engine', async () => {
                const accessorSpecs: AccessorSpecs = {
                    bla: { access: 'r', type: 'signal' },
                }
                const compilation = makeCompilation({
                    ...COMPILATION,
                    accessorSpecs,
                })
                const { engine } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        let bla: f32 = 1
                    `
                )

                assert.deepStrictEqual(engine.metadata, {
                    compilation: {
                        audioSettings: compilation.audioSettings,
                        accessorSpecs,
                        inletListenerSpecs: compilation.inletListenerSpecs,
                        engineVariableNames: compilation.engineVariableNames,
                    },
                } as EngineMetadata)
            })
        })

        describe('configure/loop', () => {
            it('should configure and return an output block of the right size', async () => {
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        loop: (
                            _,
                            { globs },
                            { audioSettings: { channelCount } }
                        ) => `
                            for (let channel: i32 = 0; channel < ${channelCount.out}; channel++) {
                                ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] = 2.0
                            }
                        `,
                    },
                }

                const graph: DspGraph.Graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isEndSink: true,
                    },
                })

                let compilation = makeCompilation({
                    ...COMPILATION,
                    nodeImplementations,
                    graph,
                    audioSettings: {
                        ...COMPILATION.audioSettings,
                        channelCount: { in: 2, out: 2 },
                    },
                })
                let blockSize = 4
                const input: Array<Float32Array> = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]
                let output: Array<Float32Array> = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]

                const { engine: engine2Channels } = await getEngine(
                    compileToAssemblyscript(compilation)
                )
                engine2Channels.configure(44100, blockSize)
                engine2Channels.loop(input, output)
                assert.deepStrictEqual(output, [
                    new Float32Array([2, 2, 2, 2]),
                    new Float32Array([2, 2, 2, 2]),
                ])

                compilation = makeCompilation({
                    ...COMPILATION,
                    nodeImplementations,
                    graph,
                    audioSettings: {
                        ...COMPILATION.audioSettings,
                        channelCount: { in: 2, out: 2 },
                    },
                })
                blockSize = 5
                output = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]
                const { engine: engine3Channels } = await getEngine(
                    compileToAssemblyscript(compilation)
                )
                engine3Channels.configure(48000, blockSize)
                engine3Channels.loop(input, output)
                assert.deepStrictEqual(output, [
                    new Float32Array([2, 2, 2, 2, 2]),
                    new Float32Array([2, 2, 2, 2, 2]),
                ])
            })

            it('should take input block and pass it to the loop', async () => {
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        loop: (
                            _,
                            { globs },
                            { audioSettings: { channelCount } }
                        ) => `
                            for (let channel: i32 = 0; channel < ${channelCount.in}; channel++) {
                                ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] 
                                    = ${globs.input}[${globs.iterFrame} + ${globs.blockSize} * channel]
                            }
                        `,
                    },
                }

                const graph: DspGraph.Graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isEndSink: true,
                    },
                })

                let compilation = makeCompilation({
                    ...COMPILATION,
                    nodeImplementations,
                    graph,
                    audioSettings: {
                        ...COMPILATION.audioSettings,
                        channelCount: { in: 2, out: 3 },
                    },
                })
                let blockSize = 4
                let input: Array<Float32Array> = [
                    new Float32Array([2, 4, 6, 8]),
                    new Float32Array([1, 3, 5, 7]),
                ]
                let output: Array<Float32Array> = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]

                const { engine } = await getEngine(
                    compileToAssemblyscript(compilation)
                )
                engine.configure(44100, blockSize)
                engine.loop(input, output)
                assert.deepStrictEqual(output, [
                    new Float32Array([2, 4, 6, 8]),
                    new Float32Array([1, 3, 5, 7]),
                    new Float32Array([0, 0, 0, 0]),
                ])
            })
        })

        describe('setArray', () => {
            it('should set the array', async () => {
                const { engine, wasmExports } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(COMPILATION) + `
                        export function testReadArray (arrayName: string, index: i32): f64 {
                            return ARRAYS[arrayName][index]
                        }
                    `
                )

                engine.setArray('array1', new Float32Array([11.1, 22.2, 33.3]))
                engine.setArray('array2', new Float64Array([44.4, 55.5]))
                engine.setArray('array3', [66.6, 77.7])

                let actual: number
                actual = wasmExports.testReadArray(
                    lowerString(engine.wasmExports, 'array1'),
                    1
                )
                assert.strictEqual(round(actual), 22.2)
                actual = wasmExports.testReadArray(
                    lowerString(engine.wasmExports, 'array2'),
                    0
                )
                assert.strictEqual(round(actual), 44.4)
                actual = wasmExports.testReadArray(
                    lowerString(engine.wasmExports, 'array3'),
                    1
                )
                assert.strictEqual(round(actual), 77.7)
            })
        })

        describe('accessors', () => {
            it('should generate accessor to read message arrays', async () => {
                const compilation = makeCompilation({
                    target: 'assemblyscript',
                    accessorSpecs: {
                        someMessageArray: {
                            type: 'message',
                            access: 'r',
                        },
                    },
                    macros,
                })
                const { engine } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        const someMessageArray: Message[] = []
                        const m1 = Message.fromTemplate([
                            ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                        ])
                        const m2 = Message.fromTemplate([
                            ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 3,
                            ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                        ])
                        msg_writeFloatDatum(m1, 0, 666.5)
                        msg_writeStringDatum(m2, 0, 'bla')
                        msg_writeFloatDatum(m2, 1, 123)
                        someMessageArray.push(m1)
                        someMessageArray.push(m2)
                `
                )
                assert.deepStrictEqual(Object.keys(engine.accessors).sort(), [
                    'read_someMessageArray',
                ])
                assert.deepStrictEqual(
                    engine.accessors.read_someMessageArray(),
                    [[666.5], ['bla', 123]]
                )
            })

            it('should generate accessors to write message arrays', async () => {
                const compilation = makeCompilation({
                    target: 'assemblyscript',
                    accessorSpecs: {
                        someMessageArray: {
                            type: 'message',
                            access: 'rw',
                        },
                    },
                    macros,
                })
                const { engine } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        let someMessageArray: Message[] = []
                    `
                )
                assert.deepStrictEqual(Object.keys(engine.accessors).sort(), [
                    'read_someMessageArray',
                    'write_someMessageArray',
                ])
                engine.accessors.write_someMessageArray([[777, 'hello'], [111]])
                assert.deepStrictEqual(
                    engine.accessors.read_someMessageArray(),
                    [[777, 'hello'], [111]]
                )
            })

            it('should generate accessors to read floats', async () => {
                const compilation = makeCompilation({
                    target: 'assemblyscript',
                    accessorSpecs: {
                        someFloat: {
                            type: 'signal',
                            access: 'r',
                        },
                    },
                    macros,
                })
                const { engine } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        const someFloat: f32 = 999
                    `
                )
                assert.deepStrictEqual(Object.keys(engine.accessors).sort(), [
                    'read_someFloat',
                ])
                assert.strictEqual(engine.accessors.read_someFloat(), 999)
            })

            it('should generate accessors to write floats', async () => {
                const compilation = makeCompilation({
                    target: 'assemblyscript',
                    accessorSpecs: {
                        someFloat: {
                            type: 'signal',
                            access: 'rw',
                        },
                    },
                    macros,
                })
                const { engine } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        let someFloat: f32 = 456
                    `
                )
                assert.deepStrictEqual(Object.keys(engine.accessors).sort(), [
                    'read_someFloat',
                    'write_someFloat',
                ])
                engine.accessors.write_someFloat(666)
                assert.strictEqual(engine.accessors.read_someFloat(), 666)
            })
        })

        describe('inlet listeners callbacks', () => {
            it('should call callback when new message sent to inlet', async () => {
                const called: Array<Array<Message>> = []
                const compilation = makeCompilation({
                    ...COMPILATION,
                    nodeImplementations: { DUMMY: { loop: () => undefined } },
                    graph: makeGraph({
                        bla: {
                            inlets: { blo: { id: 'blo', type: 'message' } },
                        },
                    }),
                    accessorSpecs: {
                        bla_INS_blo: { access: 'r', type: 'message' },
                    },
                    inletListenerSpecs: { bla: ['blo'] },
                })
                const { engine, wasmExports } = await getEngine(
                    // prettier-ignore
                    compileToAssemblyscript(compilation) + `
                        const bla_INS_blo: Message[] = [
                            Message.fromTemplate([
                                ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]},
                                ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}
                            ]),
                            Message.fromTemplate([
                                ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 2
                            ]),
                        ]
                        msg_writeFloatDatum(bla_INS_blo[0], 0, 123)
                        msg_writeFloatDatum(bla_INS_blo[0], 1, 456)
                        msg_writeStringDatum(bla_INS_blo[1], 0, 'oh')

                        export function notifyMessage(): void {
                            inletListener_bla_blo()
                        }
                    `,
                    {
                        ...BINDINGS_SETTINGS,
                        inletListenersCallbacks: {
                            bla: {
                                blo: (messages: Array<Message>) =>
                                    called.push(messages),
                            },
                        },
                    }
                )
                ;(engine.wasmExports as any).notifyMessage()
                assert.deepStrictEqual(called, [[[123, 456], ['oh']]])
                return { engine, wasmExports }
            })
        })
    })
})
