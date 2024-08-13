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

import { AudioSettings } from '../../compile/types'
import { Engine, EngineMetadata, FloatArray } from '../../run/types'
import { CoreRawModule } from '../../stdlib/core/bindings-assemblyscript'
import { MsgRawModule } from '../../stdlib/msg/bindings-assemblyscript'
import { CommonsRawModule } from '../../stdlib/commons/bindings-assemblyscript'
import { EngineLifecycleRawModule } from './engine-lifecycle-bindings'
import { IoRawModule } from './io-bindings'
import { FsRawModule } from '../../stdlib/fs/bindings-assemblyscript'
import { FsImportsAssemblyScript } from '../../stdlib/fs/types'

export type StringPointer = number

export type MessagePointer = number

/** Pointer to a float array. */
export type FloatArrayPointer = number

/** Pointer to data of unknown type that stays in the wasm space (`Message` for example). */
export type InternalPointer = number

/**
 * Pointer to an array buffer that contains i32 integers.
 * This is what we use to pass generic data back and forth from the module.
 * Because the memory layout is not fixed for data types other than strings
 * REF : https://www.assemblyscript.org/runtime.html#memory-layout
 */
export type ArrayBufferOfIntegersPointer = number

export interface BaseRawEngine {
    // Signatures of internal methods that enable to access wasm memory.
    // REF : https://www.assemblyscript.org/runtime.html#interface
    __new: (length: number, classType: number) => InternalPointer
    memory: WebAssembly.Memory
}

/**
 * Interface for members that are exported in the WASM module resulting from compilation of
 * WebPd assemblyscript code.
 */
export type RawEngine = BaseRawEngine &
    EngineLifecycleRawModule &
    IoRawModule &
    CommonsRawModule &
    CoreRawModule &
    MsgRawModule &
    FsRawModule

export type AssemblyScriptWasmImports = FsImportsAssemblyScript

export interface EngineData {
    metadata: Engine['metadata']
    wasmOutput: FloatArray
    wasmInput: FloatArray
    arrayType: typeof Float32Array | typeof Float64Array
    // We use these two values only for caching, to avoid frequent nested access
    bitDepth: AudioSettings['bitDepth']
    blockSize: EngineMetadata['settings']['audio']['blockSize']
}

/**
 * When declaring imported functions, we use objects that will be only available
 * once compilation done.
 * Therefore we use these forward references in imported functions, and fill them up
 * once compilation is done.
 */
export interface ForwardReferences<RawModuleType> {
    rawModule?: RawModuleType
    engineData: EngineData
    modules: {
        fs?: Engine['globals']['fs']
        io?: Engine['io']
    }
}
