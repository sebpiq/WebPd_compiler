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

import { AudioSettings, FloatArray } from '../../types'
import {
    core_WasmExports,
    readTypedArray,
    TypedArrayConstructor,
} from './core-bindings'
import { InternalPointer, StringPointer, FloatArrayPointer } from '../types'
import { getFloatArrayType } from '../../compile-helpers'

export interface farray_WasmExports extends core_WasmExports {
    farray_create: (length: number) => FloatArrayPointer
    farray_get: (arrayName: StringPointer) => FloatArrayPointer
    farray_set: (arrayName: StringPointer, array: FloatArrayPointer) => void
    farray_createListOfArrays: () => InternalPointer
    farray_pushToListOfArrays: (
        arrays: InternalPointer,
        array: FloatArrayPointer
    ) => void
    farray_getListOfArraysLength: (
        listOfArraysPointer: InternalPointer
    ) => number
    farray_getListOfArraysElem: (
        listOfArraysPointer: InternalPointer,
        index: number
    ) => number
}

/** @param bitDepth : Must be the same value as what was used to compile the engine. */
export const lowerFloatArray = (
    wasmExports: farray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<number> | FloatArray
) => {
    const arrayType = getFloatArrayType(bitDepth)
    const arrayPointer = wasmExports.farray_create(data.length)
    const array = readTypedArray(
        wasmExports,
        arrayType,
        arrayPointer
    ) as FloatArray
    array.set(data)
    return { array, arrayPointer }
}

/** @param bitDepth : Must be the same value as what was used to compile the engine. */
export const lowerListOfFloatArrays = (
    wasmExports: farray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<Array<number> | FloatArray>
): InternalPointer => {
    const arraysPointer = wasmExports.farray_createListOfArrays()
    data.forEach((array) => {
        const { arrayPointer } = lowerFloatArray(wasmExports, bitDepth, array)
        wasmExports.farray_pushToListOfArrays(arraysPointer, arrayPointer)
    })
    return arraysPointer
}

/** @param bitDepth : Must be the same value as what was used to compile the engine. */
export const readListOfFloatArrays = (
    wasmExports: farray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    listOfArraysPointer: InternalPointer
) => {
    const listLength =
        wasmExports.farray_getListOfArraysLength(listOfArraysPointer)
    const arrays: Array<InstanceType<TypedArrayConstructor>> = []
    const arrayType = getFloatArrayType(bitDepth)
    for (let i = 0; i < listLength; i++) {
        const arrayPointer = wasmExports.farray_getListOfArraysElem(
            listOfArraysPointer,
            i
        )
        arrays.push(readTypedArray(wasmExports, arrayType, arrayPointer))
    }
    return arrays
}