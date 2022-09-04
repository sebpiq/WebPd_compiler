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

import assert from 'assert'
import { Compilation, validateSettings, generateEngineVariableNames } from '../compilation'
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { normalizeCode } from '../test-helpers'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import MACROS from './macros'

describe('macros', () => {
    const COMPILATION: Compilation = {
        graph: {}, 
        nodeImplementations: {}, 
        settings: validateSettings({
            target: 'assemblyscript',
            channelCount: 2,
            bitDepth: 32,
        }),
        macros: MACROS,
        variableNames: generateEngineVariableNames({}, {})
    }

    describe('createMessage', () => {
        it('should generate the right code for string', () => {
            const code = MACROS.createMessage(COMPILATION, 'myMessage', [
                'bang',
                'lol',
            ])
            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                const myMessage: Message = Message.fromTemplate([${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 4, ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 3])
                writeStringDatum(myMessage, 0, "bang")
                writeStringDatum(myMessage, 1, "lol")
            `)
            )
        })

        it('should generate the right code for float', () => {
            const code = MACROS.createMessage(
                COMPILATION,
                'myMessage',
                [1.234, 888]
            )
            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                const myMessage: Message = Message.fromTemplate([${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}, ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}])
                writeFloatDatum(myMessage, 0, 1.234)
                writeFloatDatum(myMessage, 1, 888)
            `)
            )
        })
    })

    describe('isMessageMatching', () => {
        it('should generate condition for types', () => {
            const code = MACROS.isMessageMatching(COMPILATION, 'myMessage', [
                MESSAGE_DATUM_TYPE_STRING,
                MESSAGE_DATUM_TYPE_FLOAT,
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]})`
            )
        })

        it('should generate condition for values', () => {
            const code = MACROS.isMessageMatching(COMPILATION, 'myMessage', [
                'blabla',
                123.5,
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && readStringDatum(myMessage, 0) === "blabla" && readFloatDatum(myMessage, 1) === 123.5)`
            )
        })

        it('should generate condition for types and values', () => {
            const code = MACROS.isMessageMatching(COMPILATION, 'myMessage', [
                MESSAGE_DATUM_TYPE_FLOAT,
                'bla',
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && readStringDatum(myMessage, 1) === "bla")`
            )
        })
    })
})
