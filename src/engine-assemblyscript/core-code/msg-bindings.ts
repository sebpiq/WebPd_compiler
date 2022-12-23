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
    StringPointer,
    TypedArrayPointer,
} from '../types'

export interface msg_WasmExports extends core_WasmExports {
    MSG_DATUM_TYPE_FLOAT: WebAssembly.Global
    MSG_DATUM_TYPE_STRING: WebAssembly.Global

    msg_create: (
        templatePointer: ArrayBufferOfIntegersPointer
    ) => InternalPointer
    msg_getDatumTypes: (messagePointer: InternalPointer) => TypedArrayPointer
    msg_createArray: () => InternalPointer
    msg_pushToArray: (
        messageArrayPointer: InternalPointer,
        messagePointer: InternalPointer
    ) => void
    msg_writeStringDatum: (
        messagePointer: InternalPointer,
        datumIndex: number,
        stringPointer: StringPointer
    ) => void
    msg_writeFloatDatum: (
        messagePointer: InternalPointer,
        datumIndex: number,
        value: number
    ) => void
    msg_readStringDatum: (
        messagePointer: InternalPointer,
        datumIndex: number
    ) => StringPointer
    msg_readFloatDatum: (
        messagePointer: InternalPointer,
        datumIndex: number
    ) => number
}

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

export const liftMessage = (
    wasmExports: msg_WasmExports,
    messagePointer: InternalPointer
): Message => {
    const messageDatumTypesPointer =
        wasmExports.msg_getDatumTypes(messagePointer)
    const messageDatumTypes = readTypedArray(
        wasmExports,
        Int32Array,
        messageDatumTypesPointer
    )
    const message: Message = []
    messageDatumTypes.forEach((datumType, datumIndex) => {
        if (datumType === wasmExports.MSG_DATUM_TYPE_FLOAT.valueOf()) {
            message.push(
                wasmExports.msg_readFloatDatum(messagePointer, datumIndex)
            )
        } else if (
            datumType === wasmExports.MSG_DATUM_TYPE_STRING.valueOf()
        ) {
            const stringPointer = wasmExports.msg_readStringDatum(
                messagePointer,
                datumIndex
            )
            message.push(liftString(wasmExports, stringPointer))
        }
    })
    return message
}

export const lowerMessage = (
    wasmExports: msg_WasmExports,
    message: Message
): InternalPointer => {
    const messageTemplate: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(wasmExports.MSG_DATUM_TYPE_FLOAT.valueOf())
        } else if (typeof value === 'string') {
            template.push(wasmExports.MSG_DATUM_TYPE_STRING.valueOf())
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
            wasmExports.msg_writeFloatDatum(messagePointer, index, value)
        } else if (typeof value === 'string') {
            const stringPointer = lowerString(wasmExports, value)
            wasmExports.msg_writeStringDatum(
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
