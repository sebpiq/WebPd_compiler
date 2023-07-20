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
    FloatArray,
    Message,
} from '../types'
import {
    liftString,
    readTypedArray,
} from './core-bindings'
import { createFs, fsImports } from './fs-bindings'
import { liftMessage, lowerMessage } from './msg-bindings'
import {
    AssemblyScriptWasmExports,
    AssemblyScriptWasmImports,
    MessagePointer,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'
import { mapArray, mapObject } from '../functional-helpers'
import { getFloatArrayType } from '../compile-helpers'
import { createCommons } from './commons-bindings'

/** Convenience function to create and initialize an engine. */
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
    public commons: Engine['commons']
    public fs: Engine['fs']
    public metadata: Engine['metadata']

    private wasmBuffer: ArrayBuffer
    private wasmOutput: FloatArray
    private wasmInput: FloatArray
    public arrayType: typeof Float32Array | typeof Float64Array
    // We use these two values only for caching, to avoid frequent nested access
    public bitDepth: AudioSettings['bitDepth']
    private blockSize: EngineMetadata['audioSettings']['blockSize']

    constructor(wasmBuffer: ArrayBuffer) {
        this.wasmBuffer = wasmBuffer
    }

    async initialize() {
        // We need to read metadata before everything, because it is used by other initialization functions
        this.metadata = await readMetadata(this.wasmBuffer)
        this.bitDepth = this.metadata.audioSettings.bitDepth
        this.arrayType = getFloatArrayType(this.bitDepth)

        const dependencies: { 
            fs?: Engine['fs'],
            core?: AssemblyScriptWasmEngine,
            rawModule?: AssemblyScriptWasmExports,
        } = {}

        const wasmImports: AssemblyScriptWasmImports = {
            ...fsImports(dependencies),
            ...this._outletListenersImports(),
        }

        const wasmInstance = await instantiateWasmModule(this.wasmBuffer, {
            input: wasmImports,
        })
        this.wasmExports =
            wasmInstance.exports as unknown as AssemblyScriptWasmExports
        this.commons = createCommons(this.wasmExports, this)
        this.fs = createFs(this.wasmExports, this)
        this.inletCallers = this._bindInletCallers()
        this.outletListeners = this._bindOutletListeners()

        dependencies.fs = this.fs
        dependencies.core = this
        dependencies.rawModule = wasmInstance.exports as unknown as AssemblyScriptWasmExports
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
        this._updateWasmInOuts()
        this.wasmExports.loop()
        this._updateWasmInOuts()
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
