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
import { VariableName } from '../../ast/types'
import {
    FloatArrayPointer,
    InternalPointer,
} from '../../engine-assemblyscript/run/types'

export interface CoreExportsAssemblyScript {
    createFloatArray: (length: number) => FloatArrayPointer
    x_createListOfArrays: () => InternalPointer
    x_pushToListOfArrays: (
        arrays: InternalPointer,
        array: FloatArrayPointer
    ) => void
    x_getListOfArraysLength: (listOfArraysPointer: InternalPointer) => number
    x_getListOfArraysElem: (
        listOfArraysPointer: InternalPointer,
        index: number
    ) => number
    // Pointers to input and output buffers
    x_getOutput: () => FloatArrayPointer
    x_getInput: () => FloatArrayPointer
}

export interface CoreNamespacePublic {
    IT_FRAME: VariableName
    FRAME: VariableName
    BLOCK_SIZE: VariableName
    SAMPLE_RATE: VariableName
    NULL_SIGNAL: VariableName
    INPUT: VariableName
    OUTPUT: VariableName
    toInt: VariableName
    toFloat: VariableName
    createFloatArray: VariableName
    setFloatDataView: VariableName
    getFloatDataView: VariableName
}

export type CoreNamespaceAll = CoreNamespacePublic &
    Record<keyof CoreExportsAssemblyScript, VariableName>
