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
    AudioSettings,
    CodeVariableName,
    Engine,
    EngineMetadata,
    Message,
    SoundFileInfo,
} from '../types'
import {
    liftString,
    lowerString,
    readTypedArray,
} from './core-code/core-bindings'
import { fs_WasmImports } from './core-code/fs-bindings'
import { liftMessage, lowerMessage } from './core-code/msg-bindings'
import {
    FloatArray,
    lowerListOfFloatArrays,
    lowerFloatArray,
    readListOfFloatArrays,
} from './core-code/farray-bindings'
import {
    AssemblyScriptWasmExports,
    AssemblyScriptWasmImports,
    MessagePointer,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'
import { mapArray, mapObject } from '../functional-helpers'

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
    public inletCallers: Engine['inletCallers']
    public outletListeners: Engine['outletListeners']
    public farray: Engine['farray']
    public fs: Engine['fs']
    public metadata: EngineMetadata

    private wasmBuffer: ArrayBuffer
    private wasmOutput: FloatArray
    private wasmInput: FloatArray
    private arrayType: typeof Float32Array | typeof Float64Array
    // We use these two values only for caching, to avoid frequent nested access
    private bitDepth: AudioSettings['bitDepth']
    private blockSize: EngineMetadata['audioSettings']['blockSize']

    constructor(wasmBuffer: ArrayBuffer) {
        this.wasmBuffer = wasmBuffer
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        this.bitDepth = this.metadata.audioSettings.bitDepth
        this.arrayType = this.bitDepth === 32 ? Float32Array : Float64Array

        const wasmImports: AssemblyScriptWasmImports = {
            ...this._fsImports(),
            ...this._outletListenersImports(),
        }

        const wasmInstance = await instantiateWasmModule(this.wasmBuffer, {
            input: wasmImports,
        })
        this.wasmExports =
            wasmInstance.exports as unknown as AssemblyScriptWasmExports
        this.farray = this._bindTarray()
        this.fs = this._bindFs()
        this.inletCallers = this._bindInletCallers()
        this.outletListeners = this._bindOutletListeners()
    }

    configure(sampleRate: number, blockSize: number): void {
        this.blockSize = blockSize
        this.metadata.audioSettings.blockSize = blockSize
        this.metadata.audioSettings.sampleRate = sampleRate
        this.wasmExports.configure(sampleRate, blockSize)
        this._updateWasmInOuts()
    }

    loop(input: Array<FloatArray>, output: Array<FloatArray>) {
        for (let channel = 0; channel < input.length; channel++) {
            this.wasmInput.set(input[channel], channel * this.blockSize)
        }
        this.wasmExports.loop()
        for (let channel = 0; channel < output.length; channel++) {
            output[channel].set(
                this.wasmOutput.subarray(
                    this.blockSize * channel,
                    this.blockSize * (channel + 1)
                )
            )
        }
    }

    // This must be called again when doing something on the wasm module
    // which could cause memory grow (lowerString, lowerMessage,
    //      lowerBuffer, lowerMessage) :
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

    // API for data flowing HOST -> ENGINE
    _bindTarray(): Engine['farray'] {
        return {
            get: (arrayName) => {
                const arrayNamePointer = lowerString(
                    this.wasmExports,
                    arrayName
                )
                const arrayPointer =
                    this.wasmExports.farray_get(arrayNamePointer)
                return readTypedArray(
                    this.wasmExports,
                    this.arrayType,
                    arrayPointer
                ) as FloatArray
            },
            set: (arrayName, array) => {
                const stringPointer = lowerString(this.wasmExports, arrayName)
                const { arrayPointer } = lowerFloatArray(
                    this.wasmExports,
                    this.bitDepth,
                    array
                )
                this.wasmExports.farray_set(stringPointer, arrayPointer)
                this._updateWasmInOuts()
            },
        }
    }

    // API for data flowing HOST -> ENGINE
    _bindFs(): Engine['fs'] {
        return {
            sendReadSoundFileResponse: (operationId, status, sound) => {
                let soundPointer = 0
                if (sound) {
                    soundPointer = lowerListOfFloatArrays(
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
            sendWriteSoundFileResponse:
                this.wasmExports.fs_onWriteSoundFileResponse,
            sendSoundStreamData: (operationId, sound) => {
                const soundPointer = lowerListOfFloatArrays(
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
                const info = liftMessage(
                    this.wasmExports,
                    infoPointer
                ) as SoundFileInfo
                this.fs.onReadSoundFile(operationId, url, info)
            },

            i_fs_writeSoundFile: (
                operationId,
                soundPointer,
                urlPointer,
                infoPointer
            ) => {
                const sound = readListOfFloatArrays(
                    this.wasmExports,
                    this.bitDepth,
                    soundPointer
                ) as Array<FloatArray>
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(
                    this.wasmExports,
                    infoPointer
                ) as SoundFileInfo
                this.fs.onWriteSoundFile(operationId, sound, url, info)
            },

            i_fs_openSoundReadStream: (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(
                    this.wasmExports,
                    infoPointer
                ) as SoundFileInfo
                this.fs.onOpenSoundReadStream(operationId, url, info)
            },

            i_fs_openSoundWriteStream: (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(this.wasmExports, urlPointer)
                const info = liftMessage(
                    this.wasmExports,
                    infoPointer
                ) as SoundFileInfo
                this.fs.onOpenSoundWriteStream(operationId, url, info)
            },

            i_fs_sendSoundStreamData: (operationId, blockPointer) => {
                const block = readListOfFloatArrays(
                    this.wasmExports,
                    this.bitDepth,
                    blockPointer
                ) as Array<FloatArray>
                this.fs.onSoundStreamData(operationId, block)
            },

            i_fs_closeSoundStream: (...args) =>
                this.fs.onCloseSoundStream(...args),
        }
        return wasmImports
    }

    // API for data flowing HOST -> ENGINE
    _bindInletCallers(): Engine['inletCallers'] {
        return mapObject(
            this.metadata.compilation.inletCallerSpecs,
            (inletIds, nodeId) =>
                mapArray(inletIds, (inletId) => [
                    inletId,
                    (message: Message) => {
                        const messagePointer = lowerMessage(
                            this.wasmExports,
                            message
                        )
                        ;(this.wasmExports as any)[
                            this.metadata.compilation.codeVariableNames
                                .inletCallers[nodeId][inletId]
                        ](messagePointer)
                    },
                ])
        )
    }

    // API for data flowing HOST -> ENGINE
    _bindOutletListeners(): Engine['outletListeners'] {
        return mapObject(
            this.metadata.compilation.outletListenerSpecs,
            (outletIds) =>
                mapArray(outletIds, (outletId) => [
                    outletId,
                    {
                        onMessage: () => undefined,
                    },
                ])
        )
    }

    // API for data flowing ENGINE -> HOST
    _outletListenersImports() {
        const wasmImports: {
            [listenerName: CodeVariableName]: (
                messagePointer: MessagePointer
            ) => void
        } = {}
        const { codeVariableNames } = this.metadata.compilation
        Object.entries(this.metadata.compilation.outletListenerSpecs).forEach(
            ([nodeId, outletIds]) => {
                outletIds.forEach((outletId) => {
                    const listenerName =
                        codeVariableNames.outletListeners[nodeId][outletId]
                    wasmImports[listenerName] = (messagePointer) => {
                        const message = liftMessage(
                            this.wasmExports,
                            messagePointer
                        )
                        this.outletListeners[nodeId][outletId].onMessage(
                            message
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
