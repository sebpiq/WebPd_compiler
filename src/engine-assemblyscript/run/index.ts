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

import { Engine } from '../../run/types'
import {
    createFsBindings,
    createFsImports,
    FsWithDependenciesRawModule,
} from './fs-bindings'
import {
    EngineRawModule,
    AssemblyScriptWasmImports,
    EngineData,
    ForwardReferences,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'
import { getFloatArrayType } from '../../compile/compile-helpers'
import { createCommonsBindings } from './commons-bindings'
import { createModule } from '../../run/modules-helpers'
import {
    createEngineLifecycleBindings,
    createInletCallersBindings,
    createOutletListenersBindings,
    EngineLifecycleWithDependenciesRawModule,
    outletListenersImports,
    readMetadata,
} from './engine-lifecycle-bindings'
import { Bindings } from "../../run/types"

export const createEngine = async (
    wasmBuffer: ArrayBuffer
): Promise<Engine> => {
    const { rawModule, engineData, forwardReferences } =
        await createRawModule(wasmBuffer)
    const engineBindings = await createBindings(
        rawModule,
        engineData,
        forwardReferences,
    )
    return createModule(rawModule, engineBindings)
}

export const createRawModule = async (wasmBuffer: ArrayBuffer) => {
    // We need to read metadata before everything, because it is used by other initialization functions
    const metadata = await readMetadata(wasmBuffer)

    const forwardReferences: ForwardReferences<
        FsWithDependenciesRawModule & EngineLifecycleWithDependenciesRawModule
    > = { modules: {} }

    const wasmImports: AssemblyScriptWasmImports = {
        ...createFsImports(forwardReferences),
        ...outletListenersImports(forwardReferences, metadata),
    }

    const bitDepth = metadata.audioSettings.bitDepth
    const arrayType = getFloatArrayType(bitDepth)
    const engineData: EngineData = {
        metadata,
        wasmOutput: new arrayType(0),
        wasmInput: new arrayType(0),
        arrayType,
        bitDepth,
        blockSize: 0,
    }

    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: wasmImports,
    })
    const rawModule =
        wasmInstance.exports as unknown as EngineRawModule
    return { rawModule, engineData, forwardReferences }
}

export const createBindings = async (
    rawModule: EngineRawModule,
    engineData: EngineData,
    forwardReferences: ForwardReferences<
        FsWithDependenciesRawModule & EngineLifecycleWithDependenciesRawModule
    >
): Promise<Bindings<Engine>> => {
    // Create bindings for core modules
    const commons = createModule(
        rawModule,
        createCommonsBindings(rawModule, engineData)
    )
    const fs = createModule(rawModule, createFsBindings(rawModule, engineData))
    const inletCallers = createModule(
        rawModule,
        createInletCallersBindings(rawModule, engineData)
    )
    const outletListeners = createModule(
        rawModule,
        createOutletListenersBindings(rawModule, engineData)
    )

    // Update forward refs for use in Wasm imports
    forwardReferences.modules.fs = fs
    forwardReferences.modules.outletListeners = outletListeners
    forwardReferences.engineData = engineData
    forwardReferences.rawModule = rawModule

    // Build the full module
    return {
        ...createEngineLifecycleBindings(rawModule, engineData),
        metadata: { type: 'proxy', value: engineData.metadata },
        commons: { type: 'proxy', value: commons },
        fs: { type: 'proxy', value: fs },
        inletCallers: { type: 'proxy', value: inletCallers },
        outletListeners: { type: 'proxy', value: outletListeners },
    }
}