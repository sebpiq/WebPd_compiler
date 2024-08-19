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
    StringPointer,
    FloatArrayPointer,
} from '../../engine-assemblyscript/run/types'
import { FloatArray } from '../../run/types'

export interface CommonsApi {
    getArray: (arrayName: string) => FloatArray
    setArray: (arrayName: string, array: FloatArray | Array<number>) => void
}

export interface CommonsExportsAssemblyScript {
    getArray: (arrayName: StringPointer) => FloatArrayPointer
    setArray: (arrayName: StringPointer, array: FloatArrayPointer) => void
}

export type CommonsExportsJavaScript = CommonsApi

export interface CommonsNamespacePublic {
    waitFrame: VariableName
    cancelWaitFrame: VariableName
    getArray: VariableName
    setArray: VariableName
    hasArray: VariableName
    subscribeArrayChanges: VariableName
    cancelArrayChangesSubscription: VariableName
}

export interface CommonsNamespacePrivate {
    _ARRAYS: VariableName
    _ARRAYS_SKEDULER: VariableName
    _FRAME_SKEDULER: VariableName
    _emitFrame: VariableName
}

export type CommonsNamespaceAll = CommonsNamespacePublic &
    CommonsNamespacePrivate &
    Record<keyof CommonsExportsAssemblyScript, VariableName>
