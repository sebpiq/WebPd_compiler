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
    ArrayBufferOfIntegersPointer,
    MessagePointer,
    FloatArrayPointer,
    StringPointer,
} from '../../engine-assemblyscript/run/types'

export interface MsgExportsAssemblyScript {
    FLOAT_TOKEN: WebAssembly.Global
    STRING_TOKEN: WebAssembly.Global

    x_create: (templatePointer: ArrayBufferOfIntegersPointer) => MessagePointer
    x_getTokenTypes: (messagePointer: MessagePointer) => FloatArrayPointer
    x_createTemplate: (length: number) => FloatArrayPointer

    writeStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        stringPointer: StringPointer
    ) => void
    writeFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        value: number
    ) => void
    readStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => StringPointer
    readFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => number
}

export interface MsgNamespacePublic {
    FLOAT_TOKEN: VariableName
    STRING_TOKEN: VariableName
    readStringToken: VariableName
    readFloatToken: VariableName
    writeFloatToken: VariableName
    writeStringToken: VariableName
    create: VariableName
    Handler: VariableName
    /** Base type for message objects */
    Message: VariableName
    Template: VariableName
    getLength: VariableName
    getTokenType: VariableName
    isStringToken: VariableName
    isFloatToken: VariableName
    isMatching: VariableName
    floats: VariableName
    strings: VariableName
    display: VariableName
    nullMessageReceiver: VariableName
    emptyMessage: VariableName
}

interface MsgNamespacePrivate {
    _Header: VariableName
    _HeaderEntry: VariableName
    _FloatToken: VariableName
    _CharToken: VariableName
    _computeHeaderLength: VariableName
    _unpackHeader: VariableName
    _unpackTokenTypes: VariableName
    _unpackTokenPositions: VariableName
}

export type MsgNamespaceAll = MsgNamespacePublic &
    MsgNamespacePrivate &
    Record<keyof MsgExportsAssemblyScript, VariableName>
