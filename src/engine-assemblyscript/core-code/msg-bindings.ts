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

/**
 * These bindings enable easier interaction with Wasm modules generated with our AssemblyScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import { Message } from '../../types'
import { liftString, lowerString } from './core-bindings'
import { readTypedArray } from './core-bindings'
import {
    ArrayBufferOfIntegersPointer,
    MessagePointer,
    StringPointer,
    FloatArrayPointer,
} from '../types'
import { commons_WasmExports } from './commons-bindings'

export interface msg_WasmExports extends commons_WasmExports {
    MSG_FLOAT_TOKEN: WebAssembly.Global
    MSG_STRING_TOKEN: WebAssembly.Global

    msg_create: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => MessagePointer
    msg_getTokenTypes: (messagePointer: MessagePointer) => FloatArrayPointer
    msg_createTemplate: (length: number) => FloatArrayPointer
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

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

export const liftMessage = (
    wasmExports: msg_WasmExports,
    messagePointer: MessagePointer
): Message => {
    const messageTokenTypesPointer =
        wasmExports.msg_getTokenTypes(messagePointer)
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
    wasmExports: msg_WasmExports,
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
    const templateArrayPointer = wasmExports.msg_createTemplate(template.length)
    const loweredTemplateArray = readTypedArray(
        wasmExports,
        Int32Array,
        templateArrayPointer
    )
    loweredTemplateArray.set(template)
    const messagePointer = wasmExports.msg_create(templateArrayPointer)

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
