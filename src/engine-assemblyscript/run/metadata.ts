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
import { VariableName } from '../../ast/types'
import { EngineMetadata } from '../../run/types'
import { liftString } from '../../stdlib/core/bindings-assemblyscript'
import { RawEngine } from './types'
import { instantiateWasmModule } from './wasm-helpers'

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
