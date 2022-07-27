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

import assert from "assert"
import { Compilation } from "../compilation"
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from "../constants"
import MACROS from "./macros"

describe('macros', () => {

    const COMPILATION = new Compilation({}, {}, {
        target: 'assemblyscript',
        sampleRate: 44100,
        channelCount: 2,
    })

    describe('isMessageMatching', () => {

        it('should generate condition for types', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', [MESSAGE_DATUM_TYPE_STRING, MESSAGE_DATUM_TYPE_FLOAT])
            assert.strictEqual(code, '(myMessage.length === 2 && typeof myMessage[0] === "string" && typeof myMessage[1] === "number")')
        })

        it('should generate condition for values', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', ['blabla', 123.5])
            assert.strictEqual(code, '(myMessage.length === 2 && myMessage[0] === "blabla" && myMessage[1] === 123.5)')
        })

        it('should generate condition for types and values', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', [MESSAGE_DATUM_TYPE_FLOAT, 'bla'])
            assert.strictEqual(code, '(myMessage.length === 2 && typeof myMessage[0] === "number" && myMessage[1] === "bla")')
        })
    })

})