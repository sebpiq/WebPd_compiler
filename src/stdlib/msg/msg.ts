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

import { GlobalDefinitions } from '../../compile/types'
import { Sequence, Class, ConstVar, Func, Var } from '../../ast/declare'
import { MsgExportsAssemblyScript, MsgNamespaceAll } from './types'

const NAMESPACE = 'msg'

export const msg: GlobalDefinitions<
    keyof MsgNamespaceAll,
    keyof MsgExportsAssemblyScript
> = {
    namespace: NAMESPACE,
    code: ({ ns: msg }, _, { target }) => {
        // prettier-ignore
        const declareFuncs = {
            create: Func(msg.create, [Var(msg.Template, `template`)], msg.Message),
            writeStringToken: Func(msg.writeStringToken, [
                Var(msg.Message, `message`),
                Var(`Int`, `tokenIndex`),
                Var(`string`, `value`),
            ], 'void'),
            writeFloatToken: Func(msg.writeFloatToken, [
                Var(msg.Message, `message`),
                Var(`Int`, `tokenIndex`),
                Var(msg._FloatToken, `value`),
            ], 'void'),
            readStringToken: Func(msg.readStringToken, [
                Var(msg.Message, `message`),
                Var(`Int`, `tokenIndex`),
            ], 'string'),
            readFloatToken: Func(msg.readFloatToken, [
                Var(msg.Message, `message`), 
                Var(`Int`, `tokenIndex`), 
            ], msg._FloatToken),
            getLength: Func(msg.getLength, [
                Var(msg.Message, `message`)
            ], 'Int'),
            getTokenType: Func(msg.getTokenType, [
                Var(msg.Message, `message`),
                Var(`Int`, `tokenIndex`),
            ], 'Int'),
            isStringToken: Func(msg.isStringToken, [
                Var(msg.Message, `message`), 
                Var(`Int`, `tokenIndex`),   
            ], 'boolean'),
            isFloatToken: Func(msg.isFloatToken, [
                Var(msg.Message, `message`), 
                Var(`Int`, `tokenIndex`),
            ], 'boolean'),
            isMatching: Func(msg.isMatching, [
                Var(msg.Message, `message`),
                Var(`Array<${msg._HeaderEntry}>`, `tokenTypes`),
            ], 'boolean'),
            floats: Func(msg.floats, [
                Var(`Array<Float>`, `values`),
            ], msg.Message),
            strings: Func(msg.strings, [
                Var(`Array<string>`, `values`),
            ], msg.Message),
            display: Func(msg.display, [
                Var(msg.Message, `message`),
            ], 'string')
        }

        const shared = [
            Func(msg.VOID_MESSAGE_RECEIVER, [Var(msg.Message, `m`)], `void`)``,
            Var(msg.Message, msg.EMPTY_MESSAGE, `${msg.create}([])`),
        ]

        // Enforce names exist in namespace even if not using AssemblyScript.
        msg.Template
        msg.Handler

        if (target === 'assemblyscript') {
            // prettier-ignore
            return Sequence([
                `
                type ${msg.Template} = Array<Int>
                
                type ${msg._FloatToken} = Float
                type ${msg._CharToken} = Int

                type ${msg._HeaderEntry} = Int

                type ${msg.Handler} = (m: ${msg.Message}) => void
                `,

                ConstVar(msg._HeaderEntry, msg.FLOAT_TOKEN, `0`),
                ConstVar(msg._HeaderEntry, msg.STRING_TOKEN, `1`),

                // =========================== MSG API
                declareFuncs.create`
                    let i: Int = 0
                    let byteCount: Int = 0
                    let tokenTypes: Array<${msg._HeaderEntry}> = []
                    let tokenPositions: Array<${msg._HeaderEntry}> = []

                    i = 0
                    while (i < template.length) {
                        switch(template[i]) {
                            case ${msg.FLOAT_TOKEN}:
                                byteCount += sizeof<${msg._FloatToken}>()
                                tokenTypes.push(${msg.FLOAT_TOKEN})
                                tokenPositions.push(byteCount)
                                i += 1
                                break
                            case ${msg.STRING_TOKEN}:
                                byteCount += sizeof<${msg._CharToken}>() * template[i + 1]
                                tokenTypes.push(${msg.STRING_TOKEN})
                                tokenPositions.push(byteCount)
                                i += 2
                                break
                            default:
                                throw new Error("unknown token type : " + template[i].toString())
                        }
                    }

                    const tokenCount = tokenTypes.length
                    const headerByteCount = ${msg._computeHeaderLength}(tokenCount) 
                        * sizeof<${msg._HeaderEntry}>()
                    byteCount += headerByteCount

                    const buffer = new ArrayBuffer(byteCount)
                    const dataView = new DataView(buffer)
                    let writePosition: Int = 0
                    
                    dataView.setInt32(writePosition, tokenCount)
                    writePosition += sizeof<${msg._HeaderEntry}>()

                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, tokenTypes[i])
                        writePosition += sizeof<${msg._HeaderEntry}>()
                    }

                    dataView.setInt32(writePosition, headerByteCount)
                    writePosition += sizeof<${msg._HeaderEntry}>()
                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, headerByteCount + tokenPositions[i])
                        writePosition += sizeof<${msg._HeaderEntry}>()
                    }

                    const header = ${msg._unpackHeader}(dataView, tokenCount)
                    return {
                        dataView,
                        tokenCount,
                        header,
                        tokenTypes: ${msg._unpackTokenTypes}(header),
                        tokenPositions: ${msg._unpackTokenPositions}(header),
                    }
                `,

                declareFuncs.writeStringToken`
                    const startPosition = message.tokenPositions[tokenIndex]
                    const endPosition = message.tokenPositions[tokenIndex + 1]
                    const expectedStringLength: Int = (endPosition - startPosition) / sizeof<${msg._CharToken}>()
                    if (value.length !== expectedStringLength) {
                        throw new Error('Invalid string size, specified ' + expectedStringLength.toString() + ', received ' + value.length.toString())
                    }

                    for (let i = 0; i < value.length; i++) {
                        message.dataView.setInt32(
                            startPosition + i * sizeof<${msg._CharToken}>(), 
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
                    const stringLength: Int = (endPosition - startPosition) / sizeof<${msg._CharToken}>()
                    let value: string = ''
                    for (let i = 0; i < stringLength; i++) {
                        value += String.fromCodePoint(message.dataView.getInt32(startPosition + sizeof<${msg._CharToken}>() * i))
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
                    return ${msg.getTokenType}(message, tokenIndex) === ${msg.STRING_TOKEN}
                `,

                declareFuncs.isFloatToken`
                    return ${msg.getTokenType}(message, tokenIndex) === ${msg.FLOAT_TOKEN}
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
                    const message: ${msg.Message} = ${msg.create}(
                        values.map<${msg._HeaderEntry}>(v => ${msg.FLOAT_TOKEN}))
                    for (let i: Int = 0; i < values.length; i++) {
                        ${msg.writeFloatToken}(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.strings`
                    const template: ${msg.Template} = []
                    for (let i: Int = 0; i < values.length; i++) {
                        template.push(${msg.STRING_TOKEN})
                        template.push(values[i].length)
                    }
                    const message: ${msg.Message} = ${msg.create}(template)
                    for (let i: Int = 0; i < values.length; i++) {
                        ${msg.writeStringToken}(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.display`
                    let displayArray: Array<string> = []
                    for (let i: Int = 0; i < ${msg.getLength}(message); i++) {
                        if (${msg.isFloatToken}(message, i)) {
                            displayArray.push(${msg.readFloatToken}(message, i).toString())
                        } else {
                            displayArray.push('"' + ${msg.readStringToken}(message, i) + '"')
                        }
                    }
                    return '[' + displayArray.join(', ') + ']'
                `,

                Class(msg.Message, [
                    Var(`DataView`, `dataView`),
                    Var(msg._Header, `header`),
                    Var(msg._HeaderEntry, `tokenCount`),
                    Var(msg._Header, `tokenTypes`),
                    Var(msg._Header, `tokenPositions`),
                ]),

                // =========================== EXPORTED API
                Func(msg.x_create, [
                    Var(`Int32Array`, `templateTypedArray`)
                ], msg.Message)`
                    const template: ${msg.Template} = new Array<Int>(templateTypedArray.length)
                    for (let i: Int = 0; i < templateTypedArray.length; i++) {
                        template[i] = templateTypedArray[i]
                    }
                    return ${msg.create}(template)
                `,

                Func(msg.x_getTokenTypes, [
                    Var(msg.Message, `message`)
                ], msg._Header)`
                    return message.tokenTypes
                `,

                Func(msg.x_createTemplate, [
                    Var(`i32`, `length`)
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
                `type ${msg._Header} = Int32Array`,

                Func(msg._computeHeaderLength, [
                    Var(`Int`, `tokenCount`)
                ], 'Int')`
                    return 1 + tokenCount * 2 + 1
                `,

                Func(msg._unpackHeader, [
                    Var(`DataView`, `messageDataView`), 
                    Var(msg._HeaderEntry, `tokenCount`),
                ], msg._Header)`
                    const headerLength = ${msg._computeHeaderLength}(tokenCount)
                    // TODO : why is this \`wrap\` not working ?
                    // return Int32Array.wrap(messageDataView.buffer, 0, headerLength)
                    const messageHeader = new Int32Array(headerLength)
                    for (let i = 0; i < headerLength; i++) {
                        messageHeader[i] = messageDataView.getInt32(sizeof<${msg._HeaderEntry}>() * i)
                    }
                    return messageHeader
                `,

                Func(msg._unpackTokenTypes, [
                    Var(msg._Header, `header`),
                ], msg._Header)`
                    return header.slice(1, 1 + header[0])
                `,

                Func(msg._unpackTokenPositions, [
                    Var(msg._Header, `header`),
                ], msg._Header)`
                    return header.slice(1 + header[0])
                `,

                ...shared,
            ])
        } else if (target === 'javascript') {
            // prettier-ignore
            return Sequence([
                ConstVar(`string`, msg.FLOAT_TOKEN, `"number"`),
                ConstVar(`string`, msg.STRING_TOKEN, `"string"`),

                declareFuncs.create`
                    const m = []
                    let i = 0
                    while (i < template.length) {
                        if (template[i] === ${msg.STRING_TOKEN}) {
                            m.push('')
                            i += 2
                        } else if (template[i] === ${msg.FLOAT_TOKEN}) {
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
                    return ${msg.getTokenType}(message, tokenIndex) === 'string'
                `,
                declareFuncs.isFloatToken`
                    return ${msg.getTokenType}(message, tokenIndex) === 'number'
                `,
                declareFuncs.isMatching`
                    return (message.length === tokenTypes.length) 
                        && message.every((v, i) => ${msg.getTokenType}(message, i) === tokenTypes[i])
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

                ...shared,
            ])
        } else {
            throw new Error(`Unexpected target: ${target}`)
        }
    },

    exports: ({ ns: msg }, _, { target }) =>
        target === 'assemblyscript'
            ? [
                  msg.x_create,
                  msg.x_getTokenTypes,
                  msg.x_createTemplate,
                  msg.writeStringToken,
                  msg.writeFloatToken,
                  msg.readStringToken,
                  msg.readFloatToken,
                  msg.FLOAT_TOKEN,
                  msg.STRING_TOKEN,
              ]
            : [],
}
