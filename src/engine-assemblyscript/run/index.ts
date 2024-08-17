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
    RawEngine,
    AssemblyScriptWasmImports,
    EngineData,
    ForwardReferences,
} from './types'
import { instantiateWasmModule } from './wasm-helpers'
import {
    getFloatArrayType,
} from '../../run/run-helpers'
import { createCommonsBindings } from '../../stdlib/commons/bindings-assemblyscript'
import { attachBindings } from '../../run/run-helpers'
import {
    createEngineLifecycleBindings,
    EngineLifecycleRawModuleWithDependencies,
    readMetadata,
} from './engine-lifecycle-bindings'
import {
    createIoMessageReceiversBindings,
    createIoMessageSendersBindings,
    ioMsgSendersImports,
    IoRawModuleWithDependencies,
} from './io-bindings'
import { Bindings } from '../../run/types'
import {
    createFsBindings,
    createFsImports,
    FsRawModuleWithDependencies,
} from '../../stdlib/fs/bindings-assemblyscript'
import { applyEngineNameMapping } from '../../run'

export const createEngine = async <AdditionalExports>(
    wasmBuffer: ArrayBuffer,
    additionalBindings?: Bindings<AdditionalExports>,
): Promise<Engine> => {
    const { rawModule, engineData, forwardReferences } = await createRawModule(
        wasmBuffer
    )
    const rawModuleWithNameMapping = applyEngineNameMapping(
        rawModule,
        engineData.metadata.compilation.variableNamesIndex
    ) as RawEngine
    const engineBindings = createEngineBindings(
        rawModuleWithNameMapping,
        engineData
    )
    const engine = attachBindings(rawModuleWithNameMapping, {
        ...engineBindings,
        ...(additionalBindings || {}),
    })

    forwardReferences.engine = engine
    forwardReferences.rawModule = rawModuleWithNameMapping
    return engine
}

export const createRawModule = async (wasmBuffer: ArrayBuffer) => {
    // We need to read metadata before everything, because it is used by other initialization functions
    const metadata = await readMetadata(wasmBuffer)

    const bitDepth = metadata.settings.audio.bitDepth
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
        FsRawModuleWithDependencies &
            EngineLifecycleRawModuleWithDependencies &
            IoRawModuleWithDependencies
    > = { rawModule: null, engine: null }

    const wasmImports: AssemblyScriptWasmImports = {
        ...createFsImports(forwardReferences, engineData),
        ...ioMsgSendersImports(forwardReferences, engineData),
    }

    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: wasmImports,
    })
    const rawModule = wasmInstance.exports
    return { rawModule, engineData, forwardReferences }
}

export const createEngineBindings = (
    rawModule: RawEngine,
    engineData: EngineData
): Bindings<Engine> => {
    const exportedNames =
        engineData.metadata.compilation.variableNamesIndex.globals

    // Create bindings for io
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

    // Create bindings for core modules
    const globalsBindings: Bindings<Engine['globals']> = {
        commons: {
            type: 'proxy',
            value: attachBindings(
                rawModule,
                createCommonsBindings(rawModule, engineData)
            ),
        },
    }
    if ('fs' in exportedNames) {
        const fs = attachBindings(
            rawModule,
            createFsBindings(rawModule, engineData)
        )
        globalsBindings.fs = { type: 'proxy', value: fs }
    }

    // Build the full module
    return {
        ...createEngineLifecycleBindings(rawModule, engineData),
        metadata: { type: 'proxy', value: engineData.metadata },
        globals: {
            type: 'proxy',
            value: attachBindings(rawModule, globalsBindings),
        },
        io: { type: 'proxy', value: io },
    }
}
