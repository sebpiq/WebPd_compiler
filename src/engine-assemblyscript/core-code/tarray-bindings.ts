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
    readTypedArray,
    TypedArrayConstructor,
} from './core-bindings'
import { InternalPointer, TypedArrayPointer } from '../types'

export type FloatArrayConstructor =
    | typeof Float32Array
    | typeof Float64Array
export type FloatArray = InstanceType<FloatArrayConstructor>

export interface tarray_WasmExports extends core_WasmExports {
    tarray_create: (length: number) => TypedArrayPointer
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
    data: Array<number> | FloatArray
) => {
    const arrayType = getArrayType(bitDepth)
    const arrayPointer = wasmExports.tarray_create(data.length)
    const array = readTypedArray(
        wasmExports,
        arrayType,
        arrayPointer
    ) as FloatArray
    array.set(data)
    return { array, arrayPointer }
}

export const lowerListOfTypedArrays = (
    wasmExports: tarray_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<Array<number> | FloatArray>
): InternalPointer => {
    const arraysPointer = wasmExports.tarray_createListOfArrays()
    data.forEach((array) => {
        const { arrayPointer } = lowerTypedArray(wasmExports, bitDepth, array)
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
    const arrayType = getArrayType(bitDepth)
    for (let i = 0; i < listLength; i++) {
        const arrayPointer = wasmExports.tarray_getListOfArraysElem(
            listOfArraysPointer,
            i
        )
        arrays.push(readTypedArray(wasmExports, arrayType, arrayPointer))
    }
    return arrays
}

const getArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array
