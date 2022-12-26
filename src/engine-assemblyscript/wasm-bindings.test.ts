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
    FS_OPERATION_FAILURE,
    FS_OPERATION_SUCCESS,
    MSG_DATUM_TYPE_FLOAT,
    MSG_DATUM_TYPE_STRING,
} from '../constants'
import { compileWasmModule } from './test-helpers'
import { createEngine, EngineSettings, readMetadata } from './wasm-bindings'
import {
    Code,
    Compilation,
    AccessorSpecs,
    Message,
    NodeImplementations,
} from '../types'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { makeCompilation, round } from '../test-helpers'
import { MSG_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import macros from './macros'
import { EngineMetadata } from './types'
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import { DspGraph } from '@webpd/dsp-graph'
import { lowerString } from './core-code/core-bindings'

describe('AssemblyScriptWasmEngine', () => {
    const BINDINGS_SETTINGS: EngineSettings = {}

    const COMPILATION: Compilation = makeCompilation({
        target: 'assemblyscript',
        macros,
        audioSettings: {
            bitDepth: 64,
            channelCount: { in: 2, out: 2 },
        },
    })

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

    describe('AssemblyScriptWasmEngine', () => {
        const getEngine = async (
            code: Code,
            bindingsSettings: EngineSettings = BINDINGS_SETTINGS
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
                        const m1 = msg_create([
                            ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_FLOAT]}
                        ])
                        const m2 = msg_create([
                            ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_STRING]}, 3,
                            ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_FLOAT]}
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

        describe('fs', () => {
            describe('readSoundFileResponse', () => {
                const sharedTestingCode = `
                    let receivedId: fs_OperationId = -1
                    let receivedStatus: fs_OperationStatus = -1
                    let receivedSound: TypedArray[] = []
                    export function testStartReadFile (array: TypedArray): i32 {
                        return fs_readSoundFile('/some/url', function(
                            id: fs_OperationId,
                            status: fs_OperationStatus,
                            sound: TypedArray[],
                        ): void {
                            receivedId = id
                            receivedStatus = status
                            receivedSound = sound
                        })
                    }
                    export function testOperationId(): i32 {
                        return receivedId
                    }
                    export function testOperationStatus(): i32 {
                        return receivedStatus
                    }
                    export function testSoundLength(): i32 {
                        return receivedSound.length
                    }
                `

                it('should register the operation success', async () => {
                    const { engine, wasmExports } = await getEngine(
                        // prettier-ignore
                        compileToAssemblyscript(COMPILATION) + sharedTestingCode
                    )
                    const operationId = wasmExports.testStartReadFile()
                    engine.fs.readSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS,
                        [
                            new Float32Array([-0.1, -0.2, -0.3]),
                            new Float32Array([0.4, 0.5, 0.6]),
                            new Float32Array([-0.7, -0.8, -0.9]),
                        ]
                    )
                    assert.strictEqual(
                        wasmExports.testOperationId(),
                        operationId
                    )
                    assert.strictEqual(
                        wasmExports.testOperationStatus(),
                        FS_OPERATION_SUCCESS
                    )
                    assert.strictEqual(wasmExports.testSoundLength(), 3)
                })

                it('should register the operation failure', async () => {
                    const { engine, wasmExports } = await getEngine(
                        // prettier-ignore
                        compileToAssemblyscript(COMPILATION) + sharedTestingCode
                    )
                    const operationId = wasmExports.testStartReadFile()
                    engine.fs.readSoundFileResponse(
                        operationId,
                        FS_OPERATION_FAILURE
                    )
                    assert.strictEqual(
                        wasmExports.testOperationId(),
                        operationId
                    )
                    assert.strictEqual(
                        wasmExports.testOperationStatus(),
                        FS_OPERATION_FAILURE
                    )
                    assert.strictEqual(wasmExports.testSoundLength(), 0)
                })
            })

            describe('fsListenersCallbacks', () => {
                it('should call the callback', async () => {
                    const called: Array<Array<any>> = []
                    const { wasmExports } = await getEngine(
                        // prettier-ignore
                        compileToAssemblyscript(COMPILATION) + `
                            export function testStartReadFile (array: TypedArray): i32 {
                                return fs_readSoundFile('/some/url', function(): void {})
                            }
                        `,
                        {
                            fsCallbacks: {
                                readSound: (...args) => called.push(args),
                                writeSound: () => undefined,
                            },
                        }
                    )
                    const operationId = wasmExports.testStartReadFile()
                    // TODO : add infos
                    assert.deepStrictEqual(called[0].slice(0, 2), [
                        operationId,
                        '/some/url',
                    ])
                })
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
                            msg_create([
                                ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_FLOAT]},
                                ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_FLOAT]}
                            ]),
                            msg_create([
                                ${MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_STRING]}, 2
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
