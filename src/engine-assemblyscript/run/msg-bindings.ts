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

/**
 * These bindings enable easier interaction with Wasm modules generated with our AssemblyScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import { CoreRawModule, liftString, lowerString } from './core-bindings'
import { readTypedArray } from './core-bindings'
import { ArrayBufferOfIntegersPointer, FloatArrayPointer, MessagePointer, StringPointer } from './types'
import { Message, RawModule } from '../../run/types'

export interface MsgRawModule extends RawModule {
    MSG_FLOAT_TOKEN: WebAssembly.Global
    MSG_STRING_TOKEN: WebAssembly.Global

    x_msg_create: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => MessagePointer
    x_msg_getTokenTypes: (messagePointer: MessagePointer) => FloatArrayPointer
    x_msg_createTemplate: (length: number) => FloatArrayPointer
    msg_writeStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        stringPointer: StringPointer
    ) => void
    msg_writeFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number,
        value: number
    ) => void
    msg_readStringToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => StringPointer
    msg_readFloatToken: (
        messagePointer: MessagePointer,
        tokenIndex: number
    ) => number
}

export type MsgWithDependenciesRawModule = CoreRawModule & MsgRawModule

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

export const liftMessage = (
    wasmExports: MsgWithDependenciesRawModule,
    messagePointer: MessagePointer
): Message => {
    const messageTokenTypesPointer =
        wasmExports.x_msg_getTokenTypes(messagePointer)
    const messageTokenTypes = readTypedArray(
        wasmExports,
        Int32Array,
        messageTokenTypesPointer
    )
    const message: Message = []
    messageTokenTypes.forEach((tokenType, tokenIndex) => {
        if (tokenType === wasmExports.MSG_FLOAT_TOKEN.valueOf()) {
            message.push(
                wasmExports.msg_readFloatToken(messagePointer, tokenIndex)
            )
        } else if (tokenType === wasmExports.MSG_STRING_TOKEN.valueOf()) {
            const stringPointer = wasmExports.msg_readStringToken(
                messagePointer,
                tokenIndex
            )
            message.push(liftString(wasmExports, stringPointer))
        }
    })
    return message
}

export const lowerMessage = (
    wasmExports: MsgWithDependenciesRawModule,
    message: Message
): MessagePointer => {
    const template: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(wasmExports.MSG_FLOAT_TOKEN.valueOf())
        } else if (typeof value === 'string') {
            template.push(wasmExports.MSG_STRING_TOKEN.valueOf())
            template.push(value.length)
        } else {
            throw new Error(`invalid message value ${value}`)
        }
        return template
    }, [] as Array<number>)

    // Here we should ideally pass an array of Int, but I am not sure how
    // to lower a typed array in a generic manner, so using the available bindings from `commons`.
    const templateArrayPointer = wasmExports.x_msg_createTemplate(template.length)
    const loweredTemplateArray = readTypedArray(
        wasmExports,
        Int32Array,
        templateArrayPointer
    )
    loweredTemplateArray.set(template)
    const messagePointer = wasmExports.x_msg_create(templateArrayPointer)

    message.forEach((value, index) => {
        if (typeof value === 'number') {
            wasmExports.msg_writeFloatToken(messagePointer, index, value)
        } else if (typeof value === 'string') {
            const stringPointer = lowerString(wasmExports, value)
            wasmExports.msg_writeStringToken(
                messagePointer,
                index,
                stringPointer
            )
        }
    })

    return messagePointer
}
