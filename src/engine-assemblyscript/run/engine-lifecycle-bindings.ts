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
import { mapArray } from '../../functional-helpers'
import { VariableName } from '../../ast/types'
import {
    Engine,
    EngineMetadata,
    FloatArray,
    Message,
    RawModule,
} from '../../run/types'
import { CoreRawModule, liftString, readTypedArray } from './core-bindings'
import { liftMessage, lowerMessage, MsgRawModule } from './msg-bindings'
import {
    EngineData,
    FloatArrayPointer,
    MessagePointer,
    ForwardReferences,
    EngineRawModule,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'

export interface EngineLifecycleRawModule extends RawModule {
    initialize: (sampleRate: number, blockSize: number) => void
    dspLoop: () => void

    // Pointers to input and output buffers
    getOutput: () => FloatArrayPointer
    getInput: () => FloatArrayPointer

    // Pointer to a JSON string representation of `EngineMetadata`
    metadata: WebAssembly.Global
}

export type EngineLifecycleWithDependenciesRawModule = CoreRawModule &
    MsgRawModule &
    EngineLifecycleRawModule

interface EngineLifecycleBindings {
    initialize: Engine['initialize']
    dspLoop: Engine['dspLoop']
}

// This must be called again when doing something on the wasm module
// which could cause memory grow (lowerString, lowerMessage,
//      lowerBuffer, lowerMessage) :
// https://github.com/emscripten-core/emscripten/issues/6747
export const updateWasmInOuts = (
    rawModule: EngineLifecycleWithDependenciesRawModule,
    engineData: EngineData
) => {
    engineData.wasmOutput = readTypedArray(
        rawModule,
        engineData.arrayType,
        rawModule.getOutput()
    ) as FloatArray
    engineData.wasmInput = readTypedArray(
        rawModule,
        engineData.arrayType,
        rawModule.getInput()
    ) as FloatArray
}

export const createEngineLifecycleBindings = (
    rawModule: EngineLifecycleWithDependenciesRawModule,
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

export const createIoMessageReceiversBindings = (
    rawModule: EngineLifecycleWithDependenciesRawModule,
    engineData: EngineData
): Bindings<Engine['io']['messageReceivers']> =>
    Object.entries(engineData.metadata.compilation.io.messageReceivers).reduce(
        (bindings, [nodeId, spec]) => ({
            ...bindings,
            [nodeId]: {
                type: 'proxy',
                value: mapArray(spec.portletIds, (inletId) => [
                    inletId,
                    (message: Message) => {
                        const messagePointer = lowerMessage(rawModule, message)
                        ;(rawModule as any)[
                            engineData.metadata.compilation.variableNamesIndex
                                .io.messageReceivers[nodeId]![inletId]!
                        ](messagePointer)
                    },
                ]),
            },
        }),
        {}
    )

export const createIoMessageSendersBindings = (
    _: EngineLifecycleWithDependenciesRawModule,
    engineData: EngineData
): Bindings<Engine['io']['messageSenders']> =>
    Object.entries(engineData.metadata.compilation.io.messageSenders).reduce(
        (bindings, [nodeId, spec]) => ({
            ...bindings,
            [nodeId]: {
                type: 'proxy',
                value: mapArray(spec.portletIds, (outletId) => [
                    outletId,
                    {
                        onMessage: () => undefined,
                    },
                ]),
            },
        }),
        {}
    )

export const ioMsgSendersImports = (
    forwardReferences: ForwardReferences<EngineLifecycleWithDependenciesRawModule>,
    metadata: EngineMetadata
) => {
    const wasmImports: {
        [listenerName: VariableName]: (messagePointer: MessagePointer) => void
    } = {}
    const { variableNamesIndex } = metadata.compilation
    Object.entries(metadata.compilation.io.messageSenders).forEach(
        ([nodeId, spec]) => {
            spec.portletIds.forEach((outletId) => {
                const listenerName =
                    variableNamesIndex.io.messageSenders[nodeId]![outletId]!
                wasmImports[listenerName] = (messagePointer) => {
                    const message = liftMessage(
                        forwardReferences.rawModule!,
                        messagePointer
                    )
                    forwardReferences.modules.io!.messageSenders[nodeId]![
                        outletId
                    ]!.onMessage(message)
                }
            })
        }
    )
    return wasmImports
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
    const wasmExports = wasmInstance.exports as unknown as EngineRawModule
    const stringPointer = wasmExports.metadata.valueOf()
    const metadataJSON = liftString(wasmExports, stringPointer)
    return JSON.parse(metadataJSON)
}
