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

import { Code } from '../types'
import { core_WasmExports } from '../core-code/core-bindings'
import { fs_WasmExports, fs_WasmImports } from '../core-code/fs-bindings'
import { msg_WasmExports } from '../core-code/msg-bindings'
import { commons_WasmExports } from '../core-code/commons-bindings'

/** AssemblyScript Code that allows to create a wasm module with exports `AssemblyScriptWasmExports` */
export type AssemblyScriptWasmEngineCode = Code

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

/**
 * Interface for members that are exported in the WASM module resulting from compilation of
 * WebPd assemblyscript code.
 */
export type AssemblyScriptWasmExports = commons_WasmExports &
    core_WasmExports &
    msg_WasmExports &
    fs_WasmExports & {
        configure: (sampleRate: number, blockSize: number) => void
        loop: () => void

        // Pointers to input and output buffers
        getOutput: () => FloatArrayPointer
        getInput: () => FloatArrayPointer

        // Pointer to a JSON string representation of `EngineMetadata`
        metadata: WebAssembly.Global
    }

export type AssemblyScriptWasmImports = fs_WasmImports
