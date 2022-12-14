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

import { AudioSettings } from "../../types"
import { lowerBuffer } from "../assemblyscript-wasm-bindings"
import { AssemblyScriptWasmExports, InternalPointer, TypedArrayPointer } from "../types"

// TODO ASC : Supports only float32 and float64 but readTypedArray supports all types

export interface tarray_WasmExports {
    tarray_unpack: (bufferPointer: InternalPointer) => TypedArrayPointer
    tarray_createArray: () => InternalPointer
    tarray_pushToArray: (arrays: InternalPointer, array: TypedArrayPointer) => void
}

type TypedArrayConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Int32Array
    | typeof Uint32Array
    | typeof Uint8ClampedArray
    | typeof Float32Array
    | typeof Float64Array

export const lowerTypedArray = (
    wasmExports: AssemblyScriptWasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<number> | Float32Array | Float64Array
): TypedArrayPointer => {
    const bufferPointer = lowerArrayBufferOfFloats(
        wasmExports,
        bitDepth,
        data,
    )
    return wasmExports.tarray_unpack(bufferPointer)
}

// REF : Assemblyscript ESM bindings `liftTypedArray`
// TODO : move to other file ? 
export const readTypedArray = (
    wasmExports: AssemblyScriptWasmExports,
    constructor: TypedArrayConstructor,
    pointer: TypedArrayPointer
) => {
    if (!pointer) return null
    const memoryU32 = new Uint32Array(wasmExports.memory.buffer)
    return new constructor(
        wasmExports.memory.buffer,
        memoryU32[(pointer + 4) >>> 2],
        memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    )
}

// This is what we use to pass audio data back and forth from the module.
// Because the memory layout is not fixed for data types other than strings
// REF : https://www.assemblyscript.org/runtime.html#memory-layout
const lowerArrayBufferOfFloats = (
    wasmExports: AssemblyScriptWasmExports,
    bitDepth: AudioSettings['bitDepth'],
    floats: Array<number> | Float32Array | Float64Array
) => {
    const bytesPerElement = bitDepth / 8
    const buffer = new ArrayBuffer(bytesPerElement * floats.length)
    const dataView = new DataView(buffer)
    const setFloatName = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    for (let i = 0; i < floats.length; i++) {
        dataView[setFloatName](bytesPerElement * i, floats[i])
    }
    return lowerBuffer(wasmExports, buffer)
}