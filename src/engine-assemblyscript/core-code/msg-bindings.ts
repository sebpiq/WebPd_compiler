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
import {
    core_WasmExports,
    liftString,
    lowerBuffer,
    lowerString,
} from './core-bindings'
import { readTypedArray } from './core-bindings'
import {
    ArrayBufferOfIntegersPointer,
    InternalPointer,
    MessagePointer,
    StringPointer,
    TypedArrayPointer,
} from '../types'

export interface msg_WasmExports extends core_WasmExports {
    MSG_TOKEN_TYPE_FLOAT: WebAssembly.Global
    MSG_TOKEN_TYPE_STRING: WebAssembly.Global

    msg_create: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => MessagePointer
    msg_getTokenTypes: (messagePointer: MessagePointer) => TypedArrayPointer
    msg_createArray: () => InternalPointer
    msg_pushToArray: (
        messageArrayPointer: InternalPointer,
        messagePointer: MessagePointer
    ) => void
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
        if (tokenType === wasmExports.MSG_TOKEN_TYPE_FLOAT.valueOf()) {
            message.push(
                wasmExports.msg_readFloatToken(messagePointer, tokenIndex)
            )
        } else if (tokenType === wasmExports.MSG_TOKEN_TYPE_STRING.valueOf()) {
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
    const messageTemplate: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(wasmExports.MSG_TOKEN_TYPE_FLOAT.valueOf())
        } else if (typeof value === 'string') {
            template.push(wasmExports.MSG_TOKEN_TYPE_STRING.valueOf())
            template.push(value.length)
        } else {
            throw new Error(`invalid message value ${value}`)
        }
        return template
    }, [] as Array<number>)

    const messagePointer = wasmExports.msg_create(
        lowerArrayBufferOfIntegers(wasmExports, messageTemplate)
    )

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

export const lowerMessageArray = (
    wasmExports: msg_WasmExports,
    messages: Array<Message>
): InternalPointer => {
    const messageArrayPointer = wasmExports.msg_createArray()
    messages.forEach((message) => {
        wasmExports.msg_pushToArray(
            messageArrayPointer,
            lowerMessage(wasmExports, message)
        )
    })
    return messageArrayPointer
}

export const lowerArrayBufferOfIntegers = (
    wasmExports: msg_WasmExports,
    integers: Array<number>
) => {
    const buffer = new ArrayBuffer(
        INT_ARRAY_BYTES_PER_ELEMENT * integers.length
    )
    const dataView = new DataView(buffer)
    for (let i = 0; i < integers.length; i++) {
        dataView.setInt32(INT_ARRAY_BYTES_PER_ELEMENT * i, integers[i])
    }
    return lowerBuffer(wasmExports, buffer)
}
