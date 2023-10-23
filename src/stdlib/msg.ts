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

import { renderSwitch } from '../functional-helpers'
import { GlobalCodeGeneratorWithSettings } from '../types'

export const msg: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ target }) =>
        renderSwitch(
            [
                target === 'assemblyscript',
                `
                    type MessageFloatToken = Float
                    type MessageCharToken = Int

                    type MessageTemplate = Array<Int>
                    type MessageHeaderEntry = Int
                    type MessageHeader = Int32Array

                    const MSG_FLOAT_TOKEN: MessageHeaderEntry = 0
                    const MSG_STRING_TOKEN: MessageHeaderEntry = 1


                    // =========================== EXPORTED API
                    function x_msg_create(templateTypedArray: Int32Array): Message {
                        const template: MessageTemplate = new Array<Int>(templateTypedArray.length)
                        for (let i: Int = 0; i < templateTypedArray.length; i++) {
                            template[i] = templateTypedArray[i]
                        }
                        return msg_create(template)
                    }

                    function x_msg_getTokenTypes(message: Message): MessageHeader {
                        return message.tokenTypes
                    }

                    function x_msg_createTemplate(length: i32): Int32Array {
                        return new Int32Array(length)
                    }


                    // =========================== MSG API
                    function msg_create(template: MessageTemplate): Message {
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

                        return new Message(buffer)
                    }

                    function msg_writeStringToken(
                        message: Message, 
                        tokenIndex: Int,
                        value: string,
                    ): void {
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
                    }

                    function msg_writeFloatToken(
                        message: Message, 
                        tokenIndex: Int,
                        value: MessageFloatToken,
                    ): void {
                        setFloatDataView(message.dataView, message.tokenPositions[tokenIndex], value)
                    }

                    function msg_readStringToken(
                        message: Message, 
                        tokenIndex: Int,
                    ): string {
                        const startPosition = message.tokenPositions[tokenIndex]
                        const endPosition = message.tokenPositions[tokenIndex + 1]
                        const stringLength: Int = (endPosition - startPosition) / sizeof<MessageCharToken>()
                        let value: string = ''
                        for (let i = 0; i < stringLength; i++) {
                            value += String.fromCodePoint(message.dataView.getInt32(startPosition + sizeof<MessageCharToken>() * i))
                        }
                        return value
                    }

                    function msg_readFloatToken(
                        message: Message, 
                        tokenIndex: Int,
                    ): MessageFloatToken {
                        return getFloatDataView(message.dataView, message.tokenPositions[tokenIndex])
                    }

                    function msg_getLength(message: Message): Int {
                        return message.tokenTypes.length
                    }

                    function msg_getTokenType(message: Message, tokenIndex: Int): Int {
                        return message.tokenTypes[tokenIndex]
                    }

                    function msg_isStringToken(
                        message: Message, 
                        tokenIndex: Int    
                    ): boolean {
                        return msg_getTokenType(message, tokenIndex) === MSG_STRING_TOKEN
                    }

                    function msg_isFloatToken(
                        message: Message, 
                        tokenIndex: Int    
                    ): boolean {
                        return msg_getTokenType(message, tokenIndex) === MSG_FLOAT_TOKEN
                    }

                    function msg_isMatching(message: Message, tokenTypes: Array<MessageHeaderEntry>): boolean {
                        if (message.tokenTypes.length !== tokenTypes.length) {
                            return false
                        }
                        for (let i: Int = 0; i < tokenTypes.length; i++) {
                            if (message.tokenTypes[i] !== tokenTypes[i]) {
                                return false
                            }
                        }
                        return true
                    }

                    function msg_floats(values: Array<Float>): Message {
                        const message: Message = msg_create(values.map<MessageHeaderEntry>(v => MSG_FLOAT_TOKEN))
                        for (let i: Int = 0; i < values.length; i++) {
                            msg_writeFloatToken(message, i, values[i])
                        }
                        return message
                    }

                    function msg_strings(values: Array<string>): Message {
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
                    }

                    function msg_display(message: Message): string {
                        let displayArray: Array<string> = []
                        for (let i: Int = 0; i < msg_getLength(message); i++) {
                            if (msg_isFloatToken(message, i)) {
                                displayArray.push(msg_readFloatToken(message, i).toString())
                            } else {
                                displayArray.push('"' + msg_readStringToken(message, i) + '"')
                            }
                        }
                        return '[' + displayArray.join(', ') + ']'
                    }


                    // =========================== PRIVATE
                    // Message header : [
                    //      <Token count>, 
                    //      <Token 1 type>,  ..., <Token N type>, 
                    //      <Token 1 start>, ..., <Token N start>, <Token N end>
                    //      ... DATA ...
                    // ]
                    class Message {
                        public dataView: DataView
                        public header: MessageHeader
                        public tokenCount: MessageHeaderEntry
                        public tokenTypes: MessageHeader
                        public tokenPositions: MessageHeader

                        constructor(messageBuffer: ArrayBuffer) {
                            const dataView = new DataView(messageBuffer)
                            const tokenCount = _msg_unpackTokenCount(dataView)
                            const header = _msg_unpackHeader(dataView, tokenCount)
                            this.dataView = dataView
                            this.tokenCount = tokenCount
                            this.header = header 
                            this.tokenTypes = _msg_unpackTokenTypes(header)
                            this.tokenPositions = _msg_unpackTokenPositions(header)
                        }
                    }

                    function _msg_computeHeaderLength(tokenCount: Int): Int {
                        return 1 + tokenCount * 2 + 1
                    }

                    function _msg_unpackTokenCount(messageDataView: DataView): MessageHeaderEntry {
                        return messageDataView.getInt32(0)
                    }

                    function _msg_unpackHeader(messageDataView: DataView, tokenCount: MessageHeaderEntry): MessageHeader {
                        const headerLength = _msg_computeHeaderLength(tokenCount)
                        // TODO : why is this \`wrap\` not working ?
                        // return Int32Array.wrap(messageDataView.buffer, 0, headerLength)
                        const messageHeader = new Int32Array(headerLength)
                        for (let i = 0; i < headerLength; i++) {
                            messageHeader[i] = messageDataView.getInt32(sizeof<MessageHeaderEntry>() * i)
                        }
                        return messageHeader
                    }

                    function _msg_unpackTokenTypes(header: MessageHeader): MessageHeader {
                        return header.slice(1, 1 + header[0])
                    }

                    function _msg_unpackTokenPositions(header: MessageHeader): MessageHeader {
                        return header.slice(1 + header[0])
                    }
                `,
            ],
            [
                target === 'javascript',
                `
                    const MSG_FLOAT_TOKEN = "number"
                    const MSG_STRING_TOKEN = "string"
                    const msg_create = (template) => {
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
                    }
                    const msg_getLength = (m) => m.length
                    const msg_getTokenType = (m, i) => typeof m[i]
                    const msg_isStringToken = (m, i) => msg_getTokenType(m, i) === 'string'
                    const msg_isFloatToken = (m, i) => msg_getTokenType(m, i) === 'number'
                    const msg_isMatching = (m, tokenTypes) => {
                        return (m.length === tokenTypes.length) 
                            && m.every((v, i) => msg_getTokenType(m, i) === tokenTypes[i])
                    }
                    const msg_writeFloatToken = ( m, i, v ) => m[i] = v
                    const msg_writeStringToken = msg_writeFloatToken
                    const msg_readFloatToken = ( m, i ) => m[i]
                    const msg_readStringToken = msg_readFloatToken
                    const msg_floats = (v) => v
                    const msg_strings = (v) => v
                    const msg_display = (m) => '[' + m
                        .map(t => typeof t === 'string' ? '"' + t + '"' : t.toString())
                        .join(', ') + ']'
            `,
            ]
        ),

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