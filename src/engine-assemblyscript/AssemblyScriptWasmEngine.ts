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

import { AudioSettings, CodeVariableName, Engine, Message, SoundFileInfo } from '../types'
import {
    liftString,
    lowerString,
    readTypedArray,
} from './core-code/core-bindings'
import { fs_WasmImports } from './core-code/fs-bindings'
import { liftMessage, lowerMessageArray } from './core-code/msg-bindings'
import {
    FloatArray,
    lowerListOfTypedArrays,
    lowerTypedArray,
    readListOfTypedArrays,
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
export const createEngine = async (wasmBuffer: ArrayBuffer) => {
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
    private wasmOutput: FloatArray
    private wasmInput: FloatArray
    private audioConfig: AudioConfig
    private arrayType: typeof Float32Array | typeof Float64Array
    private bitDepth: AudioSettings['bitDepth']

    constructor(wasmBuffer: ArrayBuffer) {
        this.wasmBuffer = wasmBuffer
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        this.bitDepth = this.metadata.compilation.audioSettings.bitDepth
        this.arrayType =
            this.bitDepth === 32
                ? Float32Array
                : Float64Array

        const wasmImports: AssemblyScriptWasmImports = {
            ...this._fsImports(),
            ...this._inletListenersImports(),
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
        input: Array<FloatArray>,
        output: Array<FloatArray>
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
        data: Array<number> | FloatArray
    ) {
        const stringPointer = lowerString(this.wasmExports, arrayName)
        const { arrayPointer } = lowerTypedArray(
            this.wasmExports,
            this.bitDepth,
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
        ) as FloatArray
        this.wasmInput = readTypedArray(
            this.wasmExports,
            this.arrayType,
            this.wasmExports.getInput()
        ) as FloatArray
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

    // API for data flowing HOST -> ENGINE
    _bindFs(): Engine['fs'] {
        return {
            sendReadSoundFileResponse: (operationId, status, sound) => {
                let soundPointer = 0
                if (sound) {
                    soundPointer = lowerListOfTypedArrays(
                        this.wasmExports,
                        this.bitDepth,
                        sound
                    )
                }
                this.wasmExports.fs_onReadSoundFileResponse(
                    operationId,
                    status,
                    soundPointer
                )
                this._updateWasmInOuts()
            },
            sendWriteSoundFileResponse: this.wasmExports.fs_onWriteSoundFileResponse,
            sendSoundStreamData: (operationId, sound) => {
                const soundPointer = lowerListOfTypedArrays(
                    this.wasmExports,
                    this.bitDepth,
                    sound
                )
                const writtenFrameCount = this.wasmExports.fs_onSoundStreamData(
                    operationId,
                    soundPointer
                )
                this._updateWasmInOuts()
                return writtenFrameCount
            },
            closeSoundStream: this.wasmExports.fs_onCloseSoundStream,
            onReadSoundFile: () => undefined,
            onWriteSoundFile: () => undefined,
            onOpenSoundReadStream: () => undefined,
            onOpenSoundWriteStream: () => undefined,
            onSoundStreamData: () => undefined,
            onCloseSoundStream: () => undefined,
        }
    }

    // API for data flowing ENGINE -> HOST
    _fsImports(): fs_WasmImports {
        let wasmImports: fs_WasmImports = {
            i_fs_readSoundFile: (operationId, urlPointer, infoPointer) => {
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(this.wasmExports, infoPointer) as SoundFileInfo
                this.fs.onReadSoundFile(operationId, url, info)
            },

            i_fs_writeSoundFile: (
                operationId,
                soundPointer,
                urlPointer,
                infoPointer
            ) => {
                const sound = readListOfTypedArrays(
                    this.wasmExports,
                    this.bitDepth,
                    soundPointer
                ) as Array<FloatArray>
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(this.wasmExports, infoPointer) as SoundFileInfo
                this.fs.onWriteSoundFile(operationId, sound, url, info)
            },

            i_fs_openSoundReadStream: (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(this.wasmExports, infoPointer) as SoundFileInfo
                this.fs.onOpenSoundReadStream(operationId, url, info)
            },

            i_fs_openSoundWriteStream: (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(this.wasmExports, infoPointer) as SoundFileInfo
                this.fs.onOpenSoundWriteStream(operationId, url, info)
            },

            i_fs_sendSoundStreamData(operationId, blockPointer) {
                const block = readListOfTypedArrays(
                    this.wasmExports, 
                    this.bitDepth,
                    blockPointer
                )
                this.fs.onSoundStreamData(operationId, block)
            },

            i_fs_closeSoundStream: (...args) =>
                this.fs.onCloseSoundStream(...args),
        }
        return wasmImports
    }

    // API for data flowing HOST -> ENGINE
    _bindInletListeners(): Engine['inletListeners'] {
        return Object.entries(
            this.metadata.compilation.inletListenerSpecs
        ).reduce((inletListeners, [nodeId, inletIds]) => {
            inletListeners[nodeId] = {}
            inletIds.forEach(
                (inletId) =>
                    (inletListeners[nodeId][inletId] = {
                        onMessages: () => undefined,
                    })
            )
            return inletListeners
        }, {} as Engine['inletListeners'])
    }

    // API for data flowing ENGINE -> HOST
    _inletListenersImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: () => void
        } = {}
        const { engineVariableNames } = this.metadata.compilation
        Object.entries(this.metadata.compilation.inletListenerSpecs).forEach(
            ([nodeId, inletIds]) => {
                inletIds.forEach((inletId) => {
                    const listenerName =
                        engineVariableNames.inletListeners[nodeId][inletId]
                    const inletVariableName =
                        engineVariableNames.n[nodeId].ins[inletId]
                    const portVariableName =
                        engineVariableNames.accessors[inletVariableName].r
                    wasmImports[listenerName] = () => {
                        this.inletListeners[nodeId][inletId].onMessages(
                            this.accessors[portVariableName]()
                        )
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
