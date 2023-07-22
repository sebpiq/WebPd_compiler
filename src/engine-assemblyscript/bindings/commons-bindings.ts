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

import { StringPointer, FloatArrayPointer, EngineData } from '../types'
import {
    CoreRawModule,
    lowerFloatArray,
    lowerString,
    readTypedArray,
} from './core-bindings'
import { Engine, FloatArray } from '../../types'
import { Bindings } from '../../engine-common/types'
import {
    EngineCoreRawModule,
    updateWasmInOuts,
} from './engine-core-bindings'
import { MsgRawModule } from './msg-bindings'

export interface CommonsRawModule {
    commons_getArray: (arrayName: StringPointer) => FloatArrayPointer
    commons_setArray: (
        arrayName: StringPointer,
        array: FloatArrayPointer
    ) => void
}

type CommonsWithDependenciesRawModule = CoreRawModule &
    MsgRawModule &
    EngineCoreRawModule &
    CommonsRawModule

export const createCommonsBindings = (
    rawModule: CommonsWithDependenciesRawModule,
    engineData: EngineData
): Bindings<Engine['commons']> => ({
    getArray: {
        type: 'proxy',
        value: (arrayName) => {
            const arrayNamePointer = lowerString(rawModule, arrayName)
            const arrayPointer = rawModule.commons_getArray(arrayNamePointer)
            return readTypedArray(
                rawModule,
                engineData.arrayType,
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
                engineData.bitDepth,
                array
            )
            rawModule.commons_setArray(stringPointer, arrayPointer)
            updateWasmInOuts(rawModule, engineData)
        },
    },
})
