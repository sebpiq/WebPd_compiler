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
    codeGenerator: ({ target }) => {
        const declareFuncs = {
            msg_create: Func('msg_create', [Var('MessageTemplate', 'template')], 'Message'),
            msg_writeStringToken: Func('msg_writeStringToken', [
                Var('Message', 'message'),
                Var('Int', 'tokenIndex'),
                Var('string', 'value'),
            ], 'void'),
            msg_writeFloatToken: Func('msg_writeFloatToken', [
                Var('Message', 'message'),
                Var('Int', 'tokenIndex'),
                Var('MessageFloatToken', 'value'),
            ], 'void'),
            msg_readStringToken: Func('msg_readStringToken', [
                Var('Message', 'message'),
                Var('Int', 'tokenIndex'),
            ], 'string'),
            msg_readFloatToken: Func('msg_readFloatToken', [
                Var('Message', 'message'), 
                Var('Int', 'tokenIndex'), 
            ], 'MessageFloatToken'),
            msg_getLength: Func('msg_getLength', [
                Var('Message', 'message')
            ], 'Int'),
            msg_getTokenType: Func('msg_getTokenType', [
                Var('Message', 'message'),
                Var('Int', 'tokenIndex'),
            ], 'Int'),
            msg_isStringToken: Func('msg_isStringToken', [
                Var('Message', 'message'), 
                Var('Int', 'tokenIndex'),   
            ], 'boolean'),
            msg_isFloatToken: Func('msg_isFloatToken', [
                Var('Message', 'message'), 
                Var('Int', 'tokenIndex'),
            ], 'boolean'),
            msg_isMatching: Func('msg_isMatching', [
                Var('Message', 'message'),
                Var('Array<MessageHeaderEntry>', 'tokenTypes'),
            ], 'boolean'),
            msg_floats: Func('msg_floats', [
                Var('Array<Float>', 'values'),
            ], 'Message'),
            msg_strings: Func('msg_strings', [
                Var('Array<string>', 'values'),
            ], 'Message'),
            msg_display: Func('msg_display', [
                Var('Message', 'message'),
            ], 'string')
        }
        if (target === 'assemblyscript') {
            return Sequence([
                `
                type MessageFloatToken = Float
                type MessageCharToken = Int

                type MessageTemplate = Array<Int>
                type MessageHeaderEntry = Int
                type MessageHeader = Int32Array
                `,

                ConstVar('MessageHeaderEntry', 'MSG_FLOAT_TOKEN', '0'),
                ConstVar('MessageHeaderEntry', 'MSG_STRING_TOKEN', '1'),

                // =========================== EXPORTED API
                Func('x_msg_create', [
                    Var('Int32Array', 'templateTypedArray')
                ], 'Message')`
                    const template: MessageTemplate = new Array<Int>(templateTypedArray.length)
                    for (let i: Int = 0; i < templateTypedArray.length; i++) {
                        template[i] = templateTypedArray[i]
                    }
                    return msg_create(template)
                `,

                Func('x_msg_getTokenTypes', [
                    Var('Message', 'message')
                ], 'MessageHeader')`
                    return message.tokenTypes
                `,

                Func('x_msg_createTemplate', [
                    Var('i32', 'length')
                ], 'Int32Array')`
                    return new Int32Array(length)
                `,

                // =========================== MSG API
                declareFuncs.msg_create`
                    let i: Int = 0
                    let byteCount: Int = 0
                    let tokenTypes: Array<MessageHeaderEntry> = []
                    let tokenPositions: Array<MessageHeaderEntry> = []

                    i = 0
                    while (i < template.length) {
                        switch(template[i]) {
                            case MSG_FLOAT_TOKEN:
                                byteCount += sizeof<MessageFloatToken>()
                                tokenTypes.push(MSG_FLOAT_TOKEN)
                                tokenPositions.push(byteCount)
                                i += 1
                                break
                            case MSG_STRING_TOKEN:
                                byteCount += sizeof<MessageCharToken>() * template[i + 1]
                                tokenTypes.push(MSG_STRING_TOKEN)
                                tokenPositions.push(byteCount)
                                i += 2
                                break
                            default:
                                throw new Error("unknown token type : " + template[i].toString())
                        }
                    }

                    const tokenCount = tokenTypes.length
                    const headerByteCount = _msg_computeHeaderLength(tokenCount) * sizeof<MessageHeaderEntry>()
                    byteCount += headerByteCount

                    const buffer = new ArrayBuffer(byteCount)
                    const dataView = new DataView(buffer)
                    let writePosition: Int = 0
                    
                    dataView.setInt32(writePosition, tokenCount)
                    writePosition += sizeof<MessageHeaderEntry>()

                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, tokenTypes[i])
                        writePosition += sizeof<MessageHeaderEntry>()
                    }

                    dataView.setInt32(writePosition, headerByteCount)
                    writePosition += sizeof<MessageHeaderEntry>()
                    for (i = 0; i < tokenCount; i++) {
                        dataView.setInt32(writePosition, headerByteCount + tokenPositions[i])
                        writePosition += sizeof<MessageHeaderEntry>()
                    }

                    const header = _msg_unpackHeader(dataView, tokenCount)
                    return {
                        dataView,
                        tokenCount,
                        header,
                        tokenTypes: _msg_unpackTokenTypes(header),
                        tokenPositions: _msg_unpackTokenPositions(header),
                    }
                `,

                declareFuncs.msg_writeStringToken`
                    const startPosition = message.tokenPositions[tokenIndex]
                    const endPosition = message.tokenPositions[tokenIndex + 1]
                    const expectedStringLength: Int = (endPosition - startPosition) / sizeof<MessageCharToken>()
                    if (value.length !== expectedStringLength) {
                        throw new Error('Invalid string size, specified ' + expectedStringLength.toString() + ', received ' + value.length.toString())
                    }

                    for (let i = 0; i < value.length; i++) {
                        message.dataView.setInt32(
                            startPosition + i * sizeof<MessageCharToken>(), 
                            value.codePointAt(i)
                        )
                    }
                `,

                declareFuncs.msg_writeFloatToken`
                    setFloatDataView(message.dataView, message.tokenPositions[tokenIndex], value)
                `,

                declareFuncs.msg_readStringToken`
                    const startPosition = message.tokenPositions[tokenIndex]
                    const endPosition = message.tokenPositions[tokenIndex + 1]
                    const stringLength: Int = (endPosition - startPosition) / sizeof<MessageCharToken>()
                    let value: string = ''
                    for (let i = 0; i < stringLength; i++) {
                        value += String.fromCodePoint(message.dataView.getInt32(startPosition + sizeof<MessageCharToken>() * i))
                    }
                    return value
                `,

                declareFuncs.msg_readFloatToken`
                    return getFloatDataView(message.dataView, message.tokenPositions[tokenIndex])
                `,

                declareFuncs.msg_getLength`
                    return message.tokenTypes.length
                `,

                declareFuncs.msg_getTokenType`
                    return message.tokenTypes[tokenIndex]
                `,

                declareFuncs.msg_isStringToken`
                    return msg_getTokenType(message, tokenIndex) === MSG_STRING_TOKEN
                `,

                declareFuncs.msg_isFloatToken`
                    return msg_getTokenType(message, tokenIndex) === MSG_FLOAT_TOKEN
                `,

                declareFuncs.msg_isMatching`
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

                declareFuncs.msg_floats`
                    const message: Message = msg_create(values.map<MessageHeaderEntry>(v => MSG_FLOAT_TOKEN))
                    for (let i: Int = 0; i < values.length; i++) {
                        msg_writeFloatToken(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.msg_strings`
                    const template: MessageTemplate = []
                    for (let i: Int = 0; i < values.length; i++) {
                        template.push(MSG_STRING_TOKEN)
                        template.push(values[i].length)
                    }
                    const message: Message = msg_create(template)
                    for (let i: Int = 0; i < values.length; i++) {
                        msg_writeStringToken(message, i, values[i])
                    }
                    return message
                `,

                declareFuncs.msg_display`
                    let displayArray: Array<string> = []
                    for (let i: Int = 0; i < msg_getLength(message); i++) {
                        if (msg_isFloatToken(message, i)) {
                            displayArray.push(msg_readFloatToken(message, i).toString())
                        } else {
                            displayArray.push('"' + msg_readStringToken(message, i) + '"')
                        }
                    }
                    return '[' + displayArray.join(', ') + ']'
                `,
                // =========================== PRIVATE
                // Message header : [
                //      <Token count>, 
                //      <Token 1 type>,  ..., <Token N type>, 
                //      <Token 1 start>, ..., <Token N start>, <Token N end>
                //      ... DATA ...
                // ]
                Class('Message', [
                    Var('DataView', 'dataView'),
                    Var('MessageHeader', 'header'),
                    Var('MessageHeaderEntry', 'tokenCount'),
                    Var('MessageHeader', 'tokenTypes'),
                    Var('MessageHeader', 'tokenPositions'),
                ]),

                Func('_msg_computeHeaderLength', [
                    Var('Int', 'tokenCount')
                ], 'Int')`
                    return 1 + tokenCount * 2 + 1
                `,

                Func('_msg_unpackTokenCount', [
                    Var('DataView', 'messageDataView')
                ], 'MessageHeaderEntry')`
                    return messageDataView.getInt32(0)
                `,

                Func('_msg_unpackHeader', [
                    Var('DataView', 'messageDataView'), 
                    Var('MessageHeaderEntry', 'tokenCount'),
                ], 'MessageHeader')`
                    const headerLength = _msg_computeHeaderLength(tokenCount)
                    // TODO : why is this \`wrap\` not working ?
                    // return Int32Array.wrap(messageDataView.buffer, 0, headerLength)
                    const messageHeader = new Int32Array(headerLength)
                    for (let i = 0; i < headerLength; i++) {
                        messageHeader[i] = messageDataView.getInt32(sizeof<MessageHeaderEntry>() * i)
                    }
                    return messageHeader
                `,

                Func('_msg_unpackTokenTypes', [
                    Var('MessageHeader', 'header'),
                ], 'MessageHeader')`
                    return header.slice(1, 1 + header[0])
                `,

                Func('_msg_unpackTokenPositions', [
                    Var('MessageHeader', 'header'),
                ], 'MessageHeader')`
                    return header.slice(1 + header[0])
                `,
            ])
        } else if (target === 'javascript') {
            return Sequence([
                ConstVar('string', 'MSG_FLOAT_TOKEN', '"number"'),
                ConstVar('string', 'MSG_STRING_TOKEN', '"string"'),

                declareFuncs.msg_create`
                    const m = []
                    let i = 0
                    while (i < template.length) {
                        if (template[i] === MSG_STRING_TOKEN) {
                            m.push('')
                            i += 2
                        } else if (template[i] === MSG_FLOAT_TOKEN) {
                            m.push(0)
                            i += 1
                        }
                    }
                    return m
                `,

                declareFuncs.msg_getLength`
                    return message.length
                `,
                declareFuncs.msg_getTokenType`
                    return typeof message[tokenIndex]
                `,
                declareFuncs.msg_isStringToken`
                    return msg_getTokenType(message, tokenIndex) === 'string'
                `,
                declareFuncs.msg_isFloatToken`
                    return msg_getTokenType(message, tokenIndex) === 'number'
                `,
                declareFuncs.msg_isMatching`
                    return (message.length === tokenTypes.length) 
                        && message.every((v, i) => msg_getTokenType(message, i) === tokenTypes[i])
                `,
                declareFuncs.msg_writeFloatToken`
                    message[tokenIndex] = value
                `,
                declareFuncs.msg_writeStringToken`
                    message[tokenIndex] = value
                `,
                declareFuncs.msg_readFloatToken`
                    return message[tokenIndex]
                `,
                declareFuncs.msg_readStringToken`
                    return message[tokenIndex]
                `,
                declareFuncs.msg_floats`
                    return values
                `,
                declareFuncs.msg_strings`
                    return values
                `,
                declareFuncs.msg_display`
                    return '[' + message
                        .map(t => typeof t === 'string' ? '"' + t + '"' : t.toString())
                        .join(', ') + ']'
                `,
            ])
        } else {
            throw new Error(`Unexpected target: ${target}`)
        }
    },

    exports: [
        { name: 'x_msg_create', targets: ['assemblyscript'] },
        { name: 'x_msg_getTokenTypes', targets: ['assemblyscript'] },
        { name: 'x_msg_createTemplate', targets: ['assemblyscript'] },
        { name: 'msg_writeStringToken', targets: ['assemblyscript'] },
        { name: 'msg_writeFloatToken', targets: ['assemblyscript'] },
        { name: 'msg_readStringToken', targets: ['assemblyscript'] },
        { name: 'msg_readFloatToken', targets: ['assemblyscript'] },
        { name: 'MSG_FLOAT_TOKEN', targets: ['assemblyscript'] },
        { name: 'MSG_STRING_TOKEN', targets: ['assemblyscript'] },
    ],
}
