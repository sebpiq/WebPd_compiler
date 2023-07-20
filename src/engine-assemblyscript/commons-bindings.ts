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

import { StringPointer, FloatArrayPointer } from './types'
import { AssemblyScriptWasmCoreModule, core_WasmExports, lowerFloatArray, lowerString, readTypedArray } from './core-bindings'
import { Engine, FloatArray } from '../types'
import { createModule } from '../engine-common/modules'

export interface commons_WasmExports extends core_WasmExports {
    commons_getArray: (arrayName: StringPointer) => FloatArrayPointer
    commons_setArray: (
        arrayName: StringPointer,
        array: FloatArrayPointer
    ) => void
}

export const createCommons = (
    rawModule: commons_WasmExports,
    coreModule: AssemblyScriptWasmCoreModule,
): Engine['commons'] =>
    createModule<Engine['commons']>(rawModule, {
        getArray: {
            type: 'proxy',
            value: (arrayName) => {
                const arrayNamePointer = lowerString(rawModule, arrayName)
                const arrayPointer =
                    rawModule.commons_getArray(arrayNamePointer)
                return readTypedArray(
                    rawModule,
                    coreModule.arrayType,
                    arrayPointer
                ) as FloatArray
            },
        },
        setArray: {
            type: 'proxy',
            value: (arrayName, array) => {
                const stringPointer = lowerString(rawModule, arrayName)
                const { arrayPointer } = lowerFloatArray(
                    rawModule,
                    coreModule.bitDepth,
                    array
                )
                rawModule.commons_setArray(stringPointer, arrayPointer)
                coreModule._updateWasmInOuts()
            },
        }
    })
