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

import { AudioSettings } from '../../types'
import {
    core_WasmExports,
    lowerBuffer,
    readTypedArray,
    TypedArrayConstructor,
} from './core-bindings'
import { InternalPointer, TypedArrayPointer } from '../types'

// TODO ASC : Supports only float32 and float64 but readTypedArray supports all types

export interface tarray_WasmExports extends core_WasmExports {
    tarray_unpack: (bufferPointer: InternalPointer) => TypedArrayPointer
    tarray_createListOfArrays: () => InternalPointer
    tarray_pushToListOfArrays: (
        arrays: InternalPointer,
        array: TypedArrayPointer
    ) => void
    tarray_getListOfArraysLength: (
        listOfArraysPointer: InternalPointer
    ) => number
    tarray_getListOfArraysElem: (
        listOfArraysPointer: InternalPointer,
        index: number
    ) => number
}

export const lowerTypedArray = (
    wasmExports: tarray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<number> | Float32Array | Float64Array
): TypedArrayPointer => {
    const bufferPointer = lowerArrayBufferOfFloats(wasmExports, bitDepth, data)
    return wasmExports.tarray_unpack(bufferPointer)
}

export const lowerListOfTypedArrays = (
    wasmExports: tarray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<Array<number> | Float32Array | Float64Array>
): InternalPointer => {
    const arraysPointer = wasmExports.tarray_createListOfArrays()
    data.forEach((array) => {
        const arrayPointer = lowerTypedArray(wasmExports, bitDepth, array)
        wasmExports.tarray_pushToListOfArrays(arraysPointer, arrayPointer)
    })
    return arraysPointer
}

export const readListOfTypedArrays = (
    wasmExports: tarray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    listOfArraysPointer: InternalPointer
) => {
    const listLength =
        wasmExports.tarray_getListOfArraysLength(listOfArraysPointer)
    const arrays: Array<InstanceType<TypedArrayConstructor>> = []
    const arrayType = bitDepth === 64 ? Float64Array : Float32Array
    for (let i = 0; i < listLength; i++) {
        const arrayPointer = wasmExports.tarray_getListOfArraysElem(
            listOfArraysPointer,
            i
        )
        arrays.push(readTypedArray(wasmExports, arrayType, arrayPointer))
    }
    return arrays
}

// This is what we use to pass audio data back and forth from the module.
// Because the memory layout is not fixed for data types other than strings
// REF : https://www.assemblyscript.org/runtime.html#memory-layout
const lowerArrayBufferOfFloats = (
    wasmExports: tarray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<number> | Float32Array | Float64Array
) => {
    const bytesPerElement = bitDepth / 8
    const buffer = new ArrayBuffer(bytesPerElement * data.length)
    const dataView = new DataView(buffer)
    const setFloatName = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    for (let i = 0; i < data.length; i++) {
        dataView[setFloatName](bytesPerElement * i, data[i])
    }
    return lowerBuffer(wasmExports, buffer)
}
