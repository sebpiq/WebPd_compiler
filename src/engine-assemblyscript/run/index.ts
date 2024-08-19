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
import { RawEngine, AssemblyScriptWasmImports, EngineContext } from './types'
import { instantiateWasmModule } from './wasm-helpers'
import { getFloatArrayType } from '../../run/run-helpers'
import { createCommonsBindings } from '../../stdlib/commons/bindings-assemblyscript'
import { attachBindings } from '../../run/run-helpers'
import { createEngineLifecycleBindings } from './engine-lifecycle-bindings'
import { readMetadata } from './metadata'
import {
    createIoMessageReceiversBindings,
    createIoMessageSendersBindings,
    ioMsgSendersImports,
} from './io-bindings'
import { Bindings } from '../../run/types'
import {
    createFsBindings,
    createFsImports,
} from '../../stdlib/fs/bindings-assemblyscript'
import { applyEngineNameMapping } from '../../run'

export const createEngine = async <AdditionalExports>(
    wasmBuffer: ArrayBuffer,
    additionalBindings?: Bindings<AdditionalExports>
): Promise<Engine> => {
    // Create engine context
    // We need to read metadata before everything, because it is used by other initialization functions
    const metadata = await readMetadata(wasmBuffer)
    const bitDepth = metadata.settings.audio.bitDepth
    const arrayType = getFloatArrayType(bitDepth)
    const engineContext: EngineContext<RawEngine> = {
        refs: {},
        metadata: metadata,
        cache: {
            wasmOutput: new arrayType(0),
            wasmInput: new arrayType(0),
            arrayType,
            bitDepth,
            blockSize: 0,
        },
    }

    // Create raw module
    const wasmImports: AssemblyScriptWasmImports = {
        ...createFsImports(engineContext),
        ...ioMsgSendersImports(engineContext),
    }

    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: wasmImports,
    })

    engineContext.refs.rawModule = applyEngineNameMapping(
        wasmInstance.exports,
        metadata.compilation.variableNamesIndex
    ) as RawEngine

    // Create engine
    const engineBindings = createEngineBindings(engineContext)
    const engine = attachBindings(engineContext.refs.rawModule, {
        ...engineBindings,
        ...(additionalBindings || {}),
    })

    engineContext.refs.engine = engine
    return engine
}

export const createEngineBindings = (
    engineContext: EngineContext<RawEngine>
): Bindings<Engine> => {
    const { metadata, refs } = engineContext
    const exportedNames = metadata.compilation.variableNamesIndex.globals

    // Create bindings for io
    const io = {
        messageReceivers: attachBindings(
            refs.rawModule!,
            createIoMessageReceiversBindings(engineContext)
        ),
        messageSenders: attachBindings(
            refs.rawModule!,
            createIoMessageSendersBindings(engineContext)
        ),
    }

    // Create bindings for core modules
    const globalsBindings: Bindings<Engine['globals']> = {
        commons: {
            type: 'proxy',
            value: attachBindings(
                refs.rawModule!,
                createCommonsBindings(engineContext)
            ),
        },
    }
    if ('fs' in exportedNames) {
        const fs = attachBindings(
            refs.rawModule!,
            createFsBindings(engineContext)
        )
        globalsBindings.fs = { type: 'proxy', value: fs }
    }

    // Build the full module
    return {
        ...createEngineLifecycleBindings(engineContext),
        metadata: { type: 'proxy', value: metadata },
        globals: {
            type: 'proxy',
            value: attachBindings(refs.rawModule!, globalsBindings),
        },
        io: { type: 'proxy', value: io },
    }
}
