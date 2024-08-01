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

import { Bindings } from '../../run/types'
import { VariableName } from '../../ast/types'
import { Engine, EngineMetadata, FloatArray } from '../../run/types'
import {
    CoreRawModuleWithDependencies,
    liftString,
    readTypedArray,
} from './core-bindings'
import {
    MsgRawModuleWithDependencies,
} from './msg-bindings'
import {
    EngineData,
    RawEngine,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'

export interface EngineLifecycleRawModule {
    initialize: (sampleRate: number, blockSize: number) => void
    dspLoop: () => void

    // Pointer to a JSON string representation of `EngineMetadata`
    metadata: WebAssembly.Global
}

export type EngineLifecycleRawModuleWithDependencies =
    EngineLifecycleRawModule &
        MsgRawModuleWithDependencies &
        CoreRawModuleWithDependencies

interface EngineLifecycleBindings {
    initialize: Engine['initialize']
    dspLoop: Engine['dspLoop']
}

// This must be called again when doing something on the wasm module
// which could cause memory grow (lowerString, lowerMessage,
//      lowerBuffer, lowerMessage) :
// https://github.com/emscripten-core/emscripten/issues/6747
export const updateWasmInOuts = (
    rawModule: EngineLifecycleRawModuleWithDependencies,
    engineData: EngineData
) => {
    engineData.wasmOutput = readTypedArray(
        rawModule,
        engineData.arrayType,
        rawModule.globals.core.x_getOutput()
    ) as FloatArray
    engineData.wasmInput = readTypedArray(
        rawModule,
        engineData.arrayType,
        rawModule.globals.core.x_getInput()
    ) as FloatArray
}

export const createEngineLifecycleBindings = (
    rawModule: EngineLifecycleRawModuleWithDependencies,
    engineData: EngineData
): Bindings<EngineLifecycleBindings> => {
    return {
        initialize: {
            type: 'proxy',
            value: (sampleRate: number, blockSize: number): void => {
                engineData.metadata.audioSettings.blockSize = blockSize
                engineData.metadata.audioSettings.sampleRate = sampleRate
                engineData.blockSize = blockSize
                rawModule.initialize(sampleRate, blockSize)
                updateWasmInOuts(rawModule, engineData)
            },
        },

        dspLoop: {
            type: 'proxy',
            value: (input: Array<FloatArray>, output: Array<FloatArray>) => {
                for (let channel = 0; channel < input.length; channel++) {
                    engineData.wasmInput.set(
                        input[channel]!,
                        channel * engineData.blockSize
                    )
                }
                updateWasmInOuts(rawModule, engineData)
                rawModule.dspLoop()
                updateWasmInOuts(rawModule, engineData)
                for (let channel = 0; channel < output.length; channel++) {
                    output[channel]!.set(
                        engineData.wasmOutput.subarray(
                            engineData.blockSize * channel,
                            engineData.blockSize * (channel + 1)
                        )
                    )
                }
            },
        },
    }
}

export const readMetadata = async (
    wasmBuffer: ArrayBuffer
): Promise<EngineMetadata> => {
    // In order to read metadata, we need to introspect the module to get the imports
    const inputImports: {
        [listenerName: VariableName]: () => void
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
    const rawModule = wasmInstance.exports as unknown as RawEngine
    const stringPointer = rawModule.metadata.valueOf()
    const metadataJSON = liftString(rawModule, stringPointer)
    return JSON.parse(metadataJSON)
}
