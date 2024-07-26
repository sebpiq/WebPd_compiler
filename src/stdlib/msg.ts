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

import { GlobalCodeGeneratorWithSettings } from '../compile/types'
import { Sequence, Class, ConstVar, Func, Var } from '../ast/declare'

export const msg: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ globalCode, settings: { target } }) => {
        // prettier-ignore
        const declareFuncs = {
            create: Func(globalCode.msg!.create!, [Var(globalCode.msg!._Template!, 'template')], globalCode.msg!.Message!),
            writeStringToken: Func(globalCode.msg!.writeStringToken!, [
                Var(globalCode.msg!.Message!, 'message'),
                Var('Int', 'tokenIndex'),
                Var('string', 'value'),
            ], 'void'),
            writeFloatToken: Func(globalCode.msg!.writeFloatToken!, [
                Var(globalCode.msg!.Message!, 'message'),
                Var('Int', 'tokenIndex'),
                Var(globalCode.msg!._FloatToken!, 'value'),
            ], 'void'),
            readStringToken: Func(globalCode.msg!.readStringToken!, [
                Var(globalCode.msg!.Message!, 'message'),
                Var('Int', 'tokenIndex'),
            ], 'string'),
            readFloatToken: Func(globalCode.msg!.readFloatToken!, [
                Var(globalCode.msg!.Message!, 'message'), 
                Var('Int', 'tokenIndex'), 
            ], globalCode.msg!._FloatToken!),
            getLength: Func(globalCode.msg!.getLength!, [
                Var(globalCode.msg!.Message!, 'message')
            ], 'Int'),
            getTokenType: Func(globalCode.msg!.getTokenType!, [
                Var(globalCode.msg!.Message!, 'message'),
                Var('Int', 'tokenIndex'),
            ], 'Int'),
            isStringToken: Func(globalCode.msg!.isStringToken!, [
                Var(globalCode.msg!.Message!, 'message'), 
                Var('Int', 'tokenIndex'),   
            ], 'boolean'),
            isFloatToken: Func(globalCode.msg!.isFloatToken!, [
                Var(globalCode.msg!.Message!, 'message'), 
                Var('Int', 'tokenIndex'),
            ], 'boolean'),
            isMatching: Func(globalCode.msg!.isMatching!, [
                Var(globalCode.msg!.Message!, 'message'),
                Var(`Array<${globalCode.msg!._HeaderEntry!}>`, 'tokenTypes'),
            ], 'boolean'),
            floats: Func(globalCode.msg!.floats!, [
                Var('Array<Float>', 'values'),
            ], globalCode.msg!.Message!),
            strings: Func(globalCode.msg!.strings!, [
                Var('Array<string>', 'values'),
            ], globalCode.msg!.Message!),
            display: Func(globalCode.msg!.display!, [
                Var(globalCode.msg!.Message!, 'message'),
            ], 'string')
        }
        if (target === 'assemblyscript') {
            // prettier-ignore
            return Sequence([
                `
                type ${globalCode.msg!._FloatToken!} = Float
                type ${globalCode.msg!._CharToken!} = Int

                type ${globalCode.msg!._Template!} = Array<Int>
                type ${globalCode.msg!._HeaderEntry!} = Int

                type ${globalCode.msg!.Handler} = (m: ${globalCode.msg!.Message!}) => void
                `,

                ConstVar(globalCode.msg!._HeaderEntry!, globalCode.msg!.FLOAT_TOKEN!, '0'),
                ConstVar(globalCode.msg!._HeaderEntry!, globalCode.msg!.STRING_TOKEN!, '1'),

                // =========================== MSG API
                declareFuncs.create`
                    let i: Int = 0
                    let byteCount: Int = 0
                    let tokenTypes: Array<${globalCode.msg!._HeaderEntry!}> = []
                    let tokenPositions: Array<${globalCode.msg!._HeaderEntry!}> = []

                    i = 0
                    while (i < template.length) {
                        switch(template[i]) {
                            case ${globalCode.msg!.FLOAT_TOKEN!}:
                                byteCount += sizeof<${globalCode.msg!._FloatToken!}>()
                                tokenTypes.push(${globalCode.msg!.FLOAT_TOKEN!})
                                tokenPositions.push(byteCount)
                                i += 1
                                break
                            case ${globalCode.msg!.STRING_TOKEN!}:
                                byteCount += sizeof<${globalCode.msg!._CharToken!}>() * template[i + 1]
                                tokenTypes.push(${globalCode.msg!.STRING_TOKEN!})
                                tokenPositions.push(byteCount)
                                i += 2
                                break
                            default:
                                throw new Error("unknown token type : " + template[i].toString())
                        }
                    }

                    const tokenCount = tokenTypes.length
                    const headerByteCount = ${globalCode.msg!._computeHeaderLength!}(tokenCount) 
                        * sizeof<${globalCode.msg!._HeaderEntry!}>()
                    byteCount += headerByteCount

                    const buffer = new ArrayBuffer(byteCount)
                    const dataView = new DataView(buffer)
                    let writePosition: Int = 0
                    
                    dataView.setInt32(writePosition, tokenCount)
                    writePosition += sizeof<${globalCode.msg!._HeaderEntry!}>()

                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, tokenTypes[i])
                        writePosition += sizeof<${globalCode.msg!._HeaderEntry!}>()
                    }

                    dataView.setInt32(writePosition, headerByteCount)
                    writePosition += sizeof<${globalCode.msg!._HeaderEntry!}>()
                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, headerByteCount + tokenPositions[i])
                        writePosition += sizeof<${globalCode.msg!._HeaderEntry!}>()
                    }

                    const header = ${globalCode.msg!._unpackHeader!}(dataView, tokenCount)
                    return {
                        dataView,
                        tokenCount,
                        header,
                        tokenTypes: ${globalCode.msg!._unpackTokenTypes!}(header),
                        tokenPositions: ${globalCode.msg!._unpackTokenPositions!}(header),
                    }
                `,

                declareFuncs.writeStringToken`
                    const startPosition = message.tokenPositions[tokenIndex]
                    const endPosition = message.tokenPositions[tokenIndex + 1]
                    const expectedStringLength: Int = (endPosition - startPosition) / sizeof<${globalCode.msg!._CharToken!}>()
                    if (value.length !== expectedStringLength) {
                        throw new Error('Invalid string size, specified ' + expectedStringLength.toString() + ', received ' + value.length.toString())
                    }

                    for (let i = 0; i < value.length; i++) {
                        message.dataView.setInt32(
                            startPosition + i * sizeof<${globalCode.msg!._CharToken!}>(), 
                            value.codePointAt(i)
                        )
                    }
                `,

                declareFuncs.writeFloatToken`
                    setFloatDataView(message.dataView, message.tokenPositions[tokenIndex], value)
                `,

                declareFuncs.readStringToken`
                    const startPosition = message.tokenPositions[tokenIndex]
                    const endPosition = message.tokenPositions[tokenIndex + 1]
                    const stringLength: Int = (endPosition - startPosition) / sizeof<${globalCode.msg!._CharToken!}>()
                    let value: string = ''
                    for (let i = 0; i < stringLength; i++) {
                        value += String.fromCodePoint(message.dataView.getInt32(startPosition + sizeof<${globalCode.msg!._CharToken!}>() * i))
                    }
                    return value
                `,

                declareFuncs.readFloatToken`
                    return getFloatDataView(message.dataView, message.tokenPositions[tokenIndex])
                `,

                declareFuncs.getLength`
                    return message.tokenTypes.length
                `,

                declareFuncs.getTokenType`
                    return message.tokenTypes[tokenIndex]
                `,

                declareFuncs.isStringToken`
                    return ${globalCode.msg!.getTokenType!}(message, tokenIndex) === ${globalCode.msg!.STRING_TOKEN!}
                `,

                declareFuncs.isFloatToken`
                    return ${globalCode.msg!.getTokenType!}(message, tokenIndex) === ${globalCode.msg!.FLOAT_TOKEN!}
                `,

                declareFuncs.isMatching`
                    if (message.tokenTypes.length !== tokenTypes.length) {
                        return false
                    }
                    for (let i: Int = 0; i < tokenTypes.length; i++) {
                        if (message.tokenTypes[i] !== tokenTypes[i]) {
                            return false
                        }
                    }
                    return true
                `,

                declareFuncs.floats`
                    const message: ${globalCode.msg!.Message!} = ${globalCode.msg!.create!}(
                        values.map<${globalCode.msg!._HeaderEntry!}>(v => ${globalCode.msg!.FLOAT_TOKEN!}))
                    for (let i: Int = 0; i < values.length; i++) {
                        ${globalCode.msg!.writeFloatToken!}(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.strings`
                    const template: ${globalCode.msg!._Template!} = []
                    for (let i: Int = 0; i < values.length; i++) {
                        template.push(${globalCode.msg!.STRING_TOKEN!})
                        template.push(values[i].length)
                    }
                    const message: ${globalCode.msg!.Message!} = ${globalCode.msg!.create!}(template)
                    for (let i: Int = 0; i < values.length; i++) {
                        ${globalCode.msg!.writeStringToken!}(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.display`
                    let displayArray: Array<string> = []
                    for (let i: Int = 0; i < ${globalCode.msg!.getLength!}(message); i++) {
                        if (${globalCode.msg!.isFloatToken!}(message, i)) {
                            displayArray.push(${globalCode.msg!.readFloatToken!}(message, i).toString())
                        } else {
                            displayArray.push('"' + ${globalCode.msg!.readStringToken!}(message, i) + '"')
                        }
                    }
                    return '[' + displayArray.join(', ') + ']'
                `,

                Class(globalCode.msg!.Message!, [
                    Var('DataView', 'dataView'),
                    Var(globalCode.msg!._Header!, 'header'),
                    Var(globalCode.msg!._HeaderEntry!, 'tokenCount'),
                    Var(globalCode.msg!._Header!, 'tokenTypes'),
                    Var(globalCode.msg!._Header!, 'tokenPositions'),
                ]),

                // =========================== EXPORTED API
                Func(globalCode.msg!.x_create!, [
                    Var('Int32Array', 'templateTypedArray')
                ], globalCode.msg!.Message!)`
                    const template: ${globalCode.msg!._Template!} = new Array<Int>(templateTypedArray.length)
                    for (let i: Int = 0; i < templateTypedArray.length; i++) {
                        template[i] = templateTypedArray[i]
                    }
                    return ${globalCode.msg!.create!}(template)
                `,

                Func(globalCode.msg!.x_getTokenTypes!, [
                    Var(globalCode.msg!.Message!, 'message')
                ], globalCode.msg!._Header!)`
                    return message.tokenTypes
                `,

                Func(globalCode.msg!.x_createTemplate!, [
                    Var('i32', 'length')
                ], 'Int32Array')`
                    return new Int32Array(length)
                `,

                // =========================== PRIVATE
                // Message header : [
                //      <Token count>, 
                //      <Token 1 type>,  ..., <Token N type>, 
                //      <Token 1 start>, ..., <Token N start>, <Token N end>
                //      ... DATA ...
                // ]
                `type ${globalCode.msg!._Header!} = Int32Array`,

                Func(globalCode.msg!._computeHeaderLength!, [
                    Var('Int', 'tokenCount')
                ], 'Int')`
                    return 1 + tokenCount * 2 + 1
                `,

                Func(globalCode.msg!._unpackHeader!, [
                    Var('DataView', 'messageDataView'), 
                    Var(globalCode.msg!._HeaderEntry!, 'tokenCount'),
                ], globalCode.msg!._Header!)`
                    const headerLength = ${globalCode.msg!._computeHeaderLength!}(tokenCount)
                    // TODO : why is this \`wrap\` not working ?
                    // return Int32Array.wrap(messageDataView.buffer, 0, headerLength)
                    const messageHeader = new Int32Array(headerLength)
                    for (let i = 0; i < headerLength; i++) {
                        messageHeader[i] = messageDataView.getInt32(sizeof<${globalCode.msg!._HeaderEntry!}>() * i)
                    }
                    return messageHeader
                `,

                Func(globalCode.msg!._unpackTokenTypes!, [
                    Var(globalCode.msg!._Header!, 'header'),
                ], globalCode.msg!._Header!)`
                    return header.slice(1, 1 + header[0])
                `,

                Func(globalCode.msg!._unpackTokenPositions!, [
                    Var(globalCode.msg!._Header!, 'header'),
                ], globalCode.msg!._Header!)`
                    return header.slice(1 + header[0])
                `,
            ])
        } else if (target === 'javascript') {
            // prettier-ignore
            return Sequence([
                ConstVar('string', globalCode.msg!.FLOAT_TOKEN!, '"number"'),
                ConstVar('string', globalCode.msg!.STRING_TOKEN!, '"string"'),

                declareFuncs.create`
                    const m = []
                    let i = 0
                    while (i < template.length) {
                        if (template[i] === ${globalCode.msg!.STRING_TOKEN!}) {
                            m.push('')
                            i += 2
                        } else if (template[i] === ${globalCode.msg!.FLOAT_TOKEN!}) {
                            m.push(0)
                            i += 1
                        }
                    }
                    return m
                `,

                declareFuncs.getLength`
                    return message.length
                `,
                declareFuncs.getTokenType`
                    return typeof message[tokenIndex]
                `,
                declareFuncs.isStringToken`
                    return ${globalCode.msg!.getTokenType!}(message, tokenIndex) === 'string'
                `,
                declareFuncs.isFloatToken`
                    return ${globalCode.msg!.getTokenType!}(message, tokenIndex) === 'number'
                `,
                declareFuncs.isMatching`
                    return (message.length === tokenTypes.length) 
                        && message.every((v, i) => ${globalCode.msg!.getTokenType!}(message, i) === tokenTypes[i])
                `,
                declareFuncs.writeFloatToken`
                    message[tokenIndex] = value
                `,
                declareFuncs.writeStringToken`
                    message[tokenIndex] = value
                `,
                declareFuncs.readFloatToken`
                    return message[tokenIndex]
                `,
                declareFuncs.readStringToken`
                    return message[tokenIndex]
                `,
                declareFuncs.floats`
                    return values
                `,
                declareFuncs.strings`
                    return values
                `,
                declareFuncs.display`
                    return '[' + message
                        .map(t => typeof t === 'string' ? '"' + t + '"' : t.toString())
                        .join(', ') + ']'
                `,
            ])
        } else {
            throw new Error(`Unexpected target: ${target}`)
        }
    },

    exports: ({ settings: { target }, globalCode }) => target === 'assemblyscript' ? [
        globalCode.msg!.x_create!,
        globalCode.msg!.x_getTokenTypes!,
        globalCode.msg!.x_createTemplate!,
        globalCode.msg!.writeStringToken!,
        globalCode.msg!.writeFloatToken!,
        globalCode.msg!.readStringToken!,
        globalCode.msg!.readFloatToken!,
        globalCode.msg!.FLOAT_TOKEN!,
        globalCode.msg!.STRING_TOKEN!,
    ]: [],
}
