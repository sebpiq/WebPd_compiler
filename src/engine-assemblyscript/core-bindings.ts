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
import { getFloatArrayType } from "../compile-helpers"
import { FloatArrayPointer, InternalPointer } from "./types"
import { AudioSettings, FloatArray } from "../types"

export type TypedArrayConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Int32Array
    | typeof Uint32Array
    | typeof Uint8ClampedArray
    | typeof Float32Array
    | typeof Float64Array

export interface core_WasmExports {
    createFloatArray: (length: number) => FloatArrayPointer
    core_createListOfArrays: () => InternalPointer
    core_pushToListOfArrays: (
        arrays: InternalPointer,
        array: FloatArrayPointer
    ) => void
    core_getListOfArraysLength: (listOfArraysPointer: InternalPointer) => number
    core_getListOfArraysElem: (
        listOfArraysPointer: InternalPointer,
        index: number
    ) => number
    // Signatures of internal methods that enable to access wasm memory.
    // REF : https://www.assemblyscript.org/runtime.html#interface
    __new: (length: number, classType: number) => InternalPointer
    memory: WebAssembly.Memory
}

/** @copyright Assemblyscript ESM bindings */
export const liftString = (wasmExports: core_WasmExports, pointer: number) => {
    if (!pointer) return null
    pointer = pointer >>> 0
    const end =
        (pointer +
            new Uint32Array(wasmExports.memory.buffer)[(pointer - 4) >>> 2]) >>>
        1
    const memoryU16 = new Uint16Array(wasmExports.memory.buffer)
    let start = pointer >>> 1
    let string = ''
    while (end - start > 1024) {
        string += String.fromCharCode(
            ...memoryU16.subarray(start, (start += 1024))
        )
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
}

/** @copyright Assemblyscript ESM bindings */
export const lowerString = (wasmExports: core_WasmExports, value: string) => {
    if (value == null) return 0
    const length = value.length,
        pointer = wasmExports.__new(length << 1, 1) >>> 0,
        memoryU16 = new Uint16Array(wasmExports.memory.buffer)
    for (let i = 0; i < length; ++i)
        memoryU16[(pointer >>> 1) + i] = value.charCodeAt(i)
    return pointer
}

/** @copyright Assemblyscript ESM bindings */
export const lowerBuffer = (
    wasmExports: core_WasmExports,
    value: ArrayBuffer
) => {
    if (value == null) return 0
    const pointer = wasmExports.__new(value.byteLength, 0) >>> 0
    new Uint8Array(wasmExports.memory.buffer).set(
        new Uint8Array(value),
        pointer
    )
    return pointer
}

/**
 * @returns A typed array which shares buffer with the wasm module,
 * thus allowing direct read / write between the module and the host environment.
 *
 * @copyright Assemblyscript ESM bindings `liftTypedArray`
 */
export const readTypedArray = <
    _TypedArrayConstructor extends TypedArrayConstructor
>(
    wasmExports: core_WasmExports,
    constructor: _TypedArrayConstructor,
    pointer: FloatArrayPointer
) => {
    if (!pointer) return null
    const memoryU32 = new Uint32Array(wasmExports.memory.buffer)
    return new constructor(
        wasmExports.memory.buffer,
        memoryU32[(pointer + 4) >>> 2],
        memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    ) as InstanceType<_TypedArrayConstructor>
}

/** @param bitDepth : Must be the same value as what was used to compile the engine. */
export const lowerFloatArray = (
    wasmExports: core_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<number> | FloatArray
) => {
    const arrayType = getFloatArrayType(bitDepth)
    const arrayPointer = wasmExports.createFloatArray(data.length)
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
    wasmExports: core_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    data: Array<Array<number> | FloatArray>
): InternalPointer => {
    const arraysPointer = wasmExports.core_createListOfArrays()
    data.forEach((array) => {
        const { arrayPointer } = lowerFloatArray(wasmExports, bitDepth, array)
        wasmExports.core_pushToListOfArrays(arraysPointer, arrayPointer)
    })
    return arraysPointer
}

/** @param bitDepth : Must be the same value as what was used to compile the engine. */
export const readListOfFloatArrays = (
    wasmExports: core_WasmExports,
    bitDepth: AudioSettings['bitDepth'],
    listOfArraysPointer: InternalPointer
) => {
    const listLength =
        wasmExports.core_getListOfArraysLength(listOfArraysPointer)
    const arrays: Array<InstanceType<TypedArrayConstructor>> = []
    const arrayType = getFloatArrayType(bitDepth)
    for (let i = 0; i < listLength; i++) {
        const arrayPointer = wasmExports.core_getListOfArraysElem(
            listOfArraysPointer,
            i
        )
        arrays.push(readTypedArray(wasmExports, arrayType, arrayPointer))
    }
    return arrays
}
