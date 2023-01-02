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

/**
 * These bindings enable easier interaction with Wasm modules generated with our AssemblyScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import {
    CodeVariableName,
    Engine,
    Message,
} from '../types'
import {
    liftString,
    lowerString,
    readTypedArray,
} from './core-code/core-bindings'
import { fs_WasmImports } from './core-code/fs-bindings'
import { liftMessage, lowerMessageArray } from './core-code/msg-bindings'
import {
    lowerListOfTypedArrays,
    lowerTypedArray,
} from './core-code/tarray-bindings'
import {
    AssemblyScriptWasmExports,
    AssemblyScriptWasmImports,
    EngineMetadata,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'

interface AudioConfig {
    sampleRate: number
    blockSize: number
}

/**
 * Convenience function to create and initialize an engine.
 */
export const createEngine = async (
    wasmBuffer: ArrayBuffer,
) => {
    const engine = new AssemblyScriptWasmEngine(wasmBuffer)
    await engine.initialize()
    return engine
}

/**
 * Class to interact more easily with a Wasm module compiled from assemblyscript code.
 * Use `createEngine` for more convenient instantiation.
 */
export class AssemblyScriptWasmEngine implements Engine {
    public wasmExports: AssemblyScriptWasmExports
    public accessors: Engine['accessors']
    public inletListeners: Engine['inletListeners']
    public fs: Engine['fs']
    public metadata: EngineMetadata
    private wasmBuffer: ArrayBuffer
    private wasmOutput: Float32Array | Float64Array
    private wasmInput: Float32Array | Float64Array
    private audioConfig: AudioConfig
    private arrayType: typeof Float32Array | typeof Float64Array

    constructor(wasmBuffer: ArrayBuffer) {
        this.wasmBuffer = wasmBuffer
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        this.arrayType =
            this.metadata.compilation.audioSettings.bitDepth === 32
                ? Float32Array
                : Float64Array

        const wasmImports: AssemblyScriptWasmImports = {
            ...this._makeFsWasmImports(),
            ...this._makeInletListenersWasmImports(),
        }

        const wasmInstance = await instantiateWasmModule(this.wasmBuffer, {
            input: wasmImports,
        })
        this.wasmExports =
            wasmInstance.exports as unknown as AssemblyScriptWasmExports
        this.accessors = this._bindAccessors()
        this.fs = this._bindFs()
        this.inletListeners = this._bindInletListeners()
    }

    configure(sampleRate: number, blockSize: number): void {
        this.audioConfig = {
            sampleRate,
            blockSize,
        }
        this.wasmExports.configure(sampleRate, blockSize)
        this._updateWasmInOuts()
    }

    loop(
        input: Array<Float32Array | Float64Array>,
        output: Array<Float32Array | Float64Array>
    ) {
        for (let channel = 0; channel < input.length; channel++) {
            this.wasmInput.set(
                input[channel],
                channel * this.audioConfig.blockSize
            )
        }
        this.wasmExports.loop()
        for (let channel = 0; channel < output.length; channel++) {
            output[channel].set(
                this.wasmOutput.subarray(
                    this.audioConfig.blockSize * channel,
                    this.audioConfig.blockSize * (channel + 1)
                )
            )
        }
    }

    setArray(
        arrayName: string,
        data: Array<number> | Float32Array | Float64Array
    ) {
        const stringPointer = lowerString(this.wasmExports, arrayName)
        const { arrayPointer } = lowerTypedArray(
            this.wasmExports,
            this.metadata.compilation.audioSettings.bitDepth,
            data
        )
        this.wasmExports.setArray(stringPointer, arrayPointer)
        this._updateWasmInOuts()
    }

    // This must be called again when doing something on the wasm module
    // which could cause memory grow (lowerString, lowerMessage, lowerMessageArray,
    //      lowerBuffer, lowerMessage, lowerMessageArray) :
    // https://github.com/emscripten-core/emscripten/issues/6747
    _updateWasmInOuts(): void {
        this.wasmOutput = readTypedArray(
            this.wasmExports,
            this.arrayType,
            this.wasmExports.getOutput()
        ) as Float32Array | Float64Array
        this.wasmInput = readTypedArray(
            this.wasmExports,
            this.arrayType,
            this.wasmExports.getInput()
        ) as Float32Array | Float64Array
    }

    _bindAccessors(): Engine['accessors'] {
        const accessors: Engine['accessors'] = {}
        const wasmExports = this.wasmExports as any
        const { accessorSpecs, engineVariableNames } = this.metadata.compilation
        Object.entries(accessorSpecs || {}).forEach(([variableName, spec]) => {
            if (spec.access.includes('w')) {
                const portVariableName =
                    engineVariableNames.accessors[variableName].w
                if (spec.type === 'message') {
                    accessors[portVariableName] = (messages) => {
                        const messageArrayPointer = lowerMessageArray(
                            this.wasmExports,
                            messages
                        )
                        wasmExports[portVariableName](messageArrayPointer)
                    }
                } else {
                    accessors[portVariableName] = wasmExports[portVariableName]
                }
            }

            if (spec.access.includes('r')) {
                const portVariableNames =
                    engineVariableNames.accessors[variableName]
                if (spec.type === 'message') {
                    accessors[portVariableNames.r] = () => {
                        const messagesCount =
                            wasmExports[portVariableNames.r_length]()
                        const messages: Array<Message> = []
                        for (let i = 0; i < messagesCount; i++) {
                            const messagePointer =
                                wasmExports[portVariableNames.r_elem](i)
                            messages.push(
                                liftMessage(this.wasmExports, messagePointer)
                            )
                        }
                        return messages
                    }
                } else {
                    accessors[portVariableNames.r] =
                        wasmExports[portVariableNames.r]
                }
            }
        })

        return accessors
    }

    _bindFs(): Engine['fs'] {
        return {
            readSoundFileResponse: (operationId, status, sound) => {
                let soundPointer = 0
                if (sound) {
                    soundPointer = lowerListOfTypedArrays(
                        this.wasmExports,
                        this.metadata.compilation.audioSettings.bitDepth,
                        sound
                    )
                }
                this.wasmExports.fs_readSoundFileResponse(
                    operationId,
                    status,
                    soundPointer
                )
                this._updateWasmInOuts()
            },
            onRequestReadSoundFile: () => undefined,
        }
    }

    _makeFsWasmImports(): fs_WasmImports {
        let wasmImports: fs_WasmImports = {
            fs_requestReadSoundFile: (
                operationId,
                urlPointer,
                info
            ) => {
                const url = liftString(this.wasmExports, urlPointer)
                this.fs.onRequestReadSoundFile(operationId, url, info)
            },

            fs_requestWriteSoundFile: (
                urlPointer,
                listOfArraysPointer,
                info
            ) => {
                // const url = liftString(this.wasmExports, urlPointer)
                // const listOfArrays = readListOfTypedArrays(
                //     this.wasmExports,
                //     this.metadata.compilation.audioSettings.bitDepth,
                //     listOfArraysPointer
                // ) as Array<FloatArray>
                // this.fs.onRequestWriteSoundFile(url, listOfArrays, info)
            },

            fs_requestReadSoundStream: () => undefined,
            fs_requestCloseSoundStream: () => undefined,
        }
        return wasmImports
    }

    _bindInletListeners(): Engine['inletListeners'] {
        return Object.entries(this.metadata.compilation.inletListenerSpecs).reduce(
            (inletListeners, [nodeId, inletIds]) => {
                inletListeners[nodeId] = {}
                inletIds.forEach(inletId => inletListeners[nodeId][inletId] = {
                    onMessages: () => undefined
                })
                return inletListeners
            },
        {} as Engine['inletListeners'])
    }

    _makeInletListenersWasmImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: () => void
        } = {}
        const { engineVariableNames } = this.metadata.compilation
        Object.entries(this.metadata.compilation.inletListenerSpecs).forEach(
            ([nodeId, inletIds]) => {
                inletIds.forEach(inletId => {
                    const listenerName =
                        engineVariableNames.inletListeners[nodeId][inletId]
                    const inletVariableName =
                        engineVariableNames.n[nodeId].ins[inletId]
                    const portVariableName =
                        engineVariableNames.accessors[inletVariableName].r
                    wasmImports[listenerName] = () => {
                        this.inletListeners[nodeId][inletId].onMessages(this.accessors[portVariableName]())
                    }
                })
            }
        )
        return wasmImports
    }
}

export const readMetadata = async (
    wasmBuffer: ArrayBuffer
): Promise<EngineMetadata> => {
    // In order to read metadata, we need to introspect the module to get the imports
    const inputImports: {
        [listenerName: CodeVariableName]: () => void
    } = {}
    const wasmModule = WebAssembly.Module.imports(
        new WebAssembly.Module(wasmBuffer)
    )

    // Then we generate dummy functions to be able to instantiate the module
    wasmModule
        .filter(
            (imprt) => imprt.module === 'input' && imprt.kind === 'function'
        )
        .forEach((imprt) => (inputImports[imprt.name] = () => undefined))
    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: inputImports,
    })

    // Finally, once the module instantiated, we read the metadata
    const wasmExports =
        wasmInstance.exports as unknown as AssemblyScriptWasmExports
    const stringPointer = wasmExports.metadata.valueOf()
    const metadataJSON = liftString(wasmExports, stringPointer)
    return JSON.parse(metadataJSON)
}