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
import { Engine, FloatArray } from '../../run/types'
import {
    CoreRawModuleWithDependencies,
    readTypedArray,
} from '../../stdlib/core/bindings-assemblyscript'
import { MsgRawModuleWithDependencies } from '../../stdlib/msg/bindings-assemblyscript'
import { EngineContext } from './types'

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
export const updateWasmInOuts = ({
    refs,
    cache,
}: EngineContext<EngineLifecycleRawModuleWithDependencies>) => {
    cache.wasmOutput = readTypedArray(
        refs.rawModule!,
        cache.arrayType,
        refs.rawModule!.globals.core.x_getOutput()
    ) as FloatArray
    cache.wasmInput = readTypedArray(
        refs.rawModule!,
        cache.arrayType,
        refs.rawModule!.globals.core.x_getInput()
    ) as FloatArray
}

export const createEngineLifecycleBindings = (
    engineContext: EngineContext<EngineLifecycleRawModuleWithDependencies>
): Bindings<EngineLifecycleBindings> => {
    const { refs, cache, metadata } = engineContext
    return {
        initialize: {
            type: 'proxy',
            value: (sampleRate: number, blockSize: number): void => {
                metadata.settings.audio.blockSize = blockSize
                metadata.settings.audio.sampleRate = sampleRate
                cache.blockSize = blockSize
                refs.rawModule!.initialize(sampleRate, blockSize)
                updateWasmInOuts(engineContext)
            },
        },

        dspLoop: {
            type: 'proxy',
            value: (input: Array<FloatArray>, output: Array<FloatArray>) => {
                for (let channel = 0; channel < input.length; channel++) {
                    cache.wasmInput.set(
                        input[channel]!,
                        channel * cache.blockSize
                    )
                }
                updateWasmInOuts(engineContext)
                refs.rawModule!.dspLoop()
                updateWasmInOuts(engineContext)
                for (let channel = 0; channel < output.length; channel++) {
                    output[channel]!.set(
                        cache.wasmOutput.subarray(
                            cache.blockSize * channel,
                            cache.blockSize * (channel + 1)
                        )
                    )
                }
            },
        },
    }
}
