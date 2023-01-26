/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { Code } from '../types'
import { core_WasmExports } from './core-code/core-bindings'
import { fs_WasmExports, fs_WasmImports } from './core-code/fs-bindings'
import { msg_WasmExports } from './core-code/msg-bindings'
import { farray_WasmExports } from './core-code/farray-bindings'

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
export type AssemblyScriptWasmExports = farray_WasmExports &
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
