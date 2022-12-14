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
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { makeCompilation, normalizeCode } from '../test-helpers'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import macros from './macros'

describe('macros', () => {
    const COMPILATION = makeCompilation({
        target: 'assemblyscript',
        macros,
    })

    describe('createMessage', () => {
        it('should generate the right code for string', () => {
            const code = macros.createMessage(COMPILATION, 'myMessage', [
                'bang',
                'lol',
            ])
            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                const myMessage: Message = Message.fromTemplate([${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 4, ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}, 3])
                msg_writeStringDatum(myMessage, 0, "bang")
                msg_writeStringDatum(myMessage, 1, "lol")
            `)
            )
        })

        it('should generate the right code for float', () => {
            const code = macros.createMessage(
                COMPILATION,
                'myMessage',
                [1.234, 888]
            )
            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                const myMessage: Message = Message.fromTemplate([${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}, ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}])
                msg_writeFloatDatum(myMessage, 0, 1.234)
                msg_writeFloatDatum(myMessage, 1, 888)
            `)
            )
        })
    })

    describe('isMessageMatching', () => {
        it('should generate condition for types', () => {
            const code = macros.isMessageMatching(COMPILATION, 'myMessage', [
                MESSAGE_DATUM_TYPE_STRING,
                MESSAGE_DATUM_TYPE_FLOAT,
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]})`
            )
        })

        it('should generate condition for values', () => {
            const code = macros.isMessageMatching(COMPILATION, 'myMessage', [
                'blabla',
                123.5,
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && msg_readStringDatum(myMessage, 0) === "blabla" && msg_readFloatDatum(myMessage, 1) === 123.5)`
            )
        })

        it('should generate condition for types and values', () => {
            const code = macros.isMessageMatching(COMPILATION, 'myMessage', [
                MESSAGE_DATUM_TYPE_FLOAT,
                'bla',
            ])
            assert.strictEqual(
                code,
                `(myMessage.datumCount === 2 && myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && msg_readStringDatum(myMessage, 1) === "bla")`
            )
        })
    })
})
