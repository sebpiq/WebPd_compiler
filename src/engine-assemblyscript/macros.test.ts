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
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from "../engine-common"
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from "./bindings"
import MACROS from "./macros"

describe('macros', () => {

    const COMPILATION = new Compilation({}, {}, {
        target: 'assemblyscript',
        sampleRate: 44100,
        channelCount: 2,
        arraysVariableName: 'ARRAYS',
    })

    describe('isMessageMatching', () => {

        it('should generate condition for types', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', [MESSAGE_DATUM_TYPE_STRING, MESSAGE_DATUM_TYPE_FLOAT])
            assert.strictEqual(code, 
                `(myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]})`)
        })

        it('should generate condition for values', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', ['blabla', 123.5])
            assert.strictEqual(code, 
                `(myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && readStringDatum(myMessage, 0) === "blabla" && readFloatDatum(myMessage, 1) === 123.5)`)
        })

        it('should generate condition for types and values', () => {
            const code = MACROS.isMessageMatching(
                COMPILATION, 'myMessage', [MESSAGE_DATUM_TYPE_FLOAT, 'bla'])
            assert.strictEqual(code, 
                `(myMessage.datumTypes[0] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]} && myMessage.datumTypes[1] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]} && readStringDatum(myMessage, 1) === "bla")`)
        })
    })

})