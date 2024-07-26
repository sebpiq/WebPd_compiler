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

import { Engine, RawModule } from '../../run/types'
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
import {
    RawModuleWithNameMapping,
    getFloatArrayType,
} from '../../run/run-helpers'
import { createCommonsBindings } from './commons-bindings'
import { attachBindings } from '../../run/run-helpers'
import {
    createEngineLifecycleBindings,
    createIoMessageReceiversBindings,
    createIoMessageSendersBindings,
    EngineLifecycleWithDependenciesRawModule,
    ioMsgSendersImports,
    readMetadata,
} from './engine-lifecycle-bindings'
import { Bindings } from '../../run/types'

export const createEngine = async (
    wasmBuffer: ArrayBuffer
): Promise<Engine> => {
    const { rawModule, engineData, forwardReferences } =
        await createRawModule(wasmBuffer)
    const rawModuleWithNameMapping = RawModuleWithNameMapping<EngineRawModule>(
        rawModule,
        engineData.metadata.compilation.variableNamesIndex.globalCode
    )
    const engineBindings = createEngineBindings(
        rawModuleWithNameMapping,
        engineData,
    )
    const engine = attachBindings(rawModuleWithNameMapping, engineBindings)

    assignReferences(forwardReferences, rawModuleWithNameMapping, engine)
    return engine
}

export const createRawModule = async (wasmBuffer: ArrayBuffer) => {
    // We need to read metadata before everything, because it is used by other initialization functions
    const metadata = await readMetadata(wasmBuffer)

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

    const forwardReferences: ForwardReferences<
        FsWithDependenciesRawModule & EngineLifecycleWithDependenciesRawModule
    > = { modules: {}, engineData }

    const wasmImports: AssemblyScriptWasmImports = {
        ...createFsImports(forwardReferences, metadata),
        ...ioMsgSendersImports(forwardReferences, metadata),
    }

    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: wasmImports,
    })
    const rawModule = wasmInstance.exports as RawModule
    return { rawModule, engineData, forwardReferences }
}

export const createEngineBindings = (
    rawModule: EngineRawModule,
    engineData: EngineData,
): Bindings<Engine> => {
    const optionalBindings: Partial<Bindings<Engine>> = {}
    const exportedNames = engineData.metadata.compilation.variableNamesIndex.globalCode

    // Create bindings for core modules
    const commons = attachBindings(
        rawModule,
        createCommonsBindings(rawModule, engineData)
    )
    const io = {
        messageReceivers: attachBindings(
            rawModule,
            createIoMessageReceiversBindings(rawModule, engineData)
        ),
        messageSenders: attachBindings(
            rawModule,
            createIoMessageSendersBindings(rawModule, engineData)
        ),
    }
    
    if ('fs' in exportedNames) {
        const fs = attachBindings(rawModule, createFsBindings(rawModule, engineData))
        optionalBindings.fs = { type: 'proxy', value: fs }
    }

    // Build the full module
    return {
        ...optionalBindings,
        ...createEngineLifecycleBindings(rawModule, engineData),
        metadata: { type: 'proxy', value: engineData.metadata },
        commons: { type: 'proxy', value: commons },
        io: { type: 'proxy', value: io },
    }
}

export const assignReferences = (forwardReferences: ForwardReferences<
    FsWithDependenciesRawModule & EngineLifecycleWithDependenciesRawModule
>, rawModuleWithNameMapping: FsWithDependenciesRawModule & EngineLifecycleWithDependenciesRawModule, engine: Engine) => {
    // Update forward refs for use in Wasm imports
    forwardReferences.modules.io = engine.io
    forwardReferences.rawModule = rawModuleWithNameMapping
    if ('fs' in engine) {
        forwardReferences.modules.fs = engine.fs
    }
}