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

/**
 * AssemblyScript Code that allows to create a wasm module with exports `AssemblyScriptWasmExports`
 */
export type AssemblyScriptWasmEngineCode = Code

export type StringPointer = number

/**
 * Pointer to a typed array.
 */
export type TypedArrayPointer = number

/**
 * Pointer to data of unknown type that stays in the wasm space (`Message` for example).
 */
export type InternalPointer = number

/**
 * Pointer to an array buffer that contains i32 integers.
 * This is what we use to pass generic data back and forth from the module.
 * Because the memory layout is not fixed for data types other than strings
 * REF : https://www.assemblyscript.org/runtime.html#memory-layout
 */
export type ArrayBufferOfIntegersPointer = number

/**
 * Pointer to an array buffer that contains floats (f32 or f64 depending on setting bitDepth).
 * This is what we use to pass audio data back and forth from the module.
 * Because the memory layout is not fixed for data types other than strings
 * REF : https://www.assemblyscript.org/runtime.html#memory-layout
 */
export type ArrayBufferOfFloatsPointer = number

/**
 * Interface for members that are exported in the WASM module resulting from compilation of
 * WebPd assemblyscript code.
 */
export interface AssemblyScriptWasmExports {
    configure: (sampleRate: number, blockSize: number) => TypedArrayPointer
    loop: () => void
    setArray: (
        arrayName: StringPointer,
        buffer: ArrayBufferOfFloatsPointer
    ) => void

    memory: WebAssembly.Memory

    MESSAGE_DATUM_TYPE_FLOAT: WebAssembly.Global
    MESSAGE_DATUM_TYPE_STRING: WebAssembly.Global

    createMessage: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => InternalPointer
    getMessageDatumTypes: (messagePointer: InternalPointer) => TypedArrayPointer
    createMessageArray: () => InternalPointer
    pushMessageToArray: (
        messageArrayPointer: InternalPointer,
        messagePointer: InternalPointer
    ) => void
    writeStringDatum: (
        messagePointer: InternalPointer,
        datumIndex: number,
        stringPointer: StringPointer
    ) => void
    writeFloatDatum: (
        messagePointer: InternalPointer,
        datumIndex: number,
        value: number
    ) => void
    readStringDatum: (
        messagePointer: InternalPointer,
        datumIndex: number
    ) => StringPointer
    readFloatDatum: (
        messagePointer: InternalPointer,
        datumIndex: number
    ) => number

    // Signatures of internal methods that enable to access wasm memory.
    // REF : https://www.assemblyscript.org/runtime.html#interface
    __new: (length: number, classType: number) => InternalPointer
}
