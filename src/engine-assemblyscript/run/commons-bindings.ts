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

import { EngineData, FloatArrayPointer, StringPointer } from './types'
import {
    CoreRawModule,
    lowerFloatArray,
    lowerString,
    readTypedArray,
} from './core-bindings'
import { Engine, FloatArray, RawModule } from '../../run/types'
import { Bindings } from '../../run/types'
import {
    EngineLifecycleRawModule,
    updateWasmInOuts,
} from './engine-lifecycle-bindings'
import { MsgRawModule } from './msg-bindings'

export interface CommonsRawModule extends RawModule {
    commons: {
        getArray: (arrayName: StringPointer) => FloatArrayPointer
        setArray: (arrayName: StringPointer, array: FloatArrayPointer) => void
    }
}

type CommonsDependencies = CoreRawModule &
    MsgRawModule &
    EngineLifecycleRawModule

type CommonsWithDependencies = CommonsDependencies &
    CommonsRawModule

export const createCommonsBindings = (
    rawModule: CommonsWithDependencies,
    engineData: EngineData
): Bindings<Engine['commons']> => {
    return {
        getArray: {
            type: 'proxy',
            value: (arrayName) => {
                const arrayNamePointer = lowerString(
                    rawModule,
                    arrayName
                )
                const arrayPointer =
                    rawModule.commons.getArray(arrayNamePointer)
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
                const stringPointer = lowerString(
                    rawModule,
                    arrayName
                )
                const { arrayPointer } = lowerFloatArray(
                    rawModule,
                    engineData.bitDepth,
                    array
                )
                rawModule.commons.setArray(
                    stringPointer,
                    arrayPointer
                )
                updateWasmInOuts(rawModule, engineData)
            },
        },
    }
}
