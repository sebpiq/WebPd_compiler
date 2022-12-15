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
import { core_WasmExports, lowerBuffer } from "./core-bindings"
import { InternalPointer, TypedArrayPointer } from "../types"

// TODO ASC : Supports only float32 and float64 but readTypedArray supports all types

export interface tarray_WasmExports extends core_WasmExports {
    tarray_unpack: (bufferPointer: InternalPointer) => TypedArrayPointer
    tarray_createArray: () => InternalPointer
    tarray_pushToArray: (arrays: InternalPointer, array: TypedArrayPointer) => void
}

export const lowerTypedArray = (
    wasmExports: tarray_WasmExports,
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

// This is what we use to pass audio data back and forth from the module.
// Because the memory layout is not fixed for data types other than strings
// REF : https://www.assemblyscript.org/runtime.html#memory-layout
const lowerArrayBufferOfFloats = (
    wasmExports: tarray_WasmExports,
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