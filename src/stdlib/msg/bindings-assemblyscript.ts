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

import {
    CoreRawModuleWithDependencies,
    liftString,
    lowerString,
} from '../core/bindings-assemblyscript'
import { readTypedArray } from '../core/bindings-assemblyscript'
import { MessagePointer } from '../../engine-assemblyscript/run/types'
import { Message } from '../../run/types'
import { MsgExportsAssemblyScript } from './types'

export interface MsgRawModule {
    globals: {
        msg: MsgExportsAssemblyScript
    }
}

export type MsgRawModuleWithDependencies = MsgRawModule &
    CoreRawModuleWithDependencies

export const INT_ARRAY_BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT

export const liftMessage = (
    rawModule: MsgRawModuleWithDependencies,
    messagePointer: MessagePointer
): Message => {
    const messageTokenTypesPointer =
        rawModule.globals.msg.x_getTokenTypes(messagePointer)
    const messageTokenTypes = readTypedArray(
        rawModule,
        Int32Array,
        messageTokenTypesPointer
    )!
    const message: Message = []
    messageTokenTypes.forEach((tokenType, tokenIndex) => {
        if (tokenType === rawModule.globals.msg.FLOAT_TOKEN.valueOf()) {
            message.push(
                rawModule.globals.msg.readFloatToken(messagePointer, tokenIndex)
            )
        } else if (tokenType === rawModule.globals.msg.STRING_TOKEN.valueOf()) {
            const stringPointer = rawModule.globals.msg.readStringToken(
                messagePointer,
                tokenIndex
            )
            message.push(liftString(rawModule, stringPointer)!)
        }
    })
    return message
}

export const lowerMessage = (
    rawModule: MsgRawModuleWithDependencies,
    message: Message
): MessagePointer => {
    const template: Array<number> = message.reduce((template, value) => {
        if (typeof value === 'number') {
            template.push(rawModule.globals.msg.FLOAT_TOKEN.valueOf())
        } else if (typeof value === 'string') {
            template.push(rawModule.globals.msg.STRING_TOKEN.valueOf())
            template.push(value.length)
        } else {
            throw new Error(`invalid message value ${value}`)
        }
        return template
    }, [] as Array<number>)

    // Here we should ideally pass an array of Int, but I am not sure how
    // to lower a typed array in a generic manner, so using the available bindings from `commons`.
    const templateArrayPointer = rawModule.globals.msg.x_createTemplate(
        template.length
    )
    const loweredTemplateArray = readTypedArray(
        rawModule,
        Int32Array,
        templateArrayPointer
    )
    loweredTemplateArray.set(template)
    const messagePointer = rawModule.globals.msg.x_create(templateArrayPointer)

    message.forEach((value, index) => {
        if (typeof value === 'number') {
            rawModule.globals.msg.writeFloatToken(messagePointer, index, value)
        } else if (typeof value === 'string') {
            const stringPointer = lowerString(rawModule, value)
            rawModule.globals.msg.writeStringToken(
                messagePointer,
                index,
                stringPointer
            )
        }
    })

    return messagePointer
}
