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

import { runTestSuite } from '../test-helpers'
import { core } from './core'
import { msg } from './msg'

describe('msg', () => {
    runTestSuite(
        [
            {
                description: 'msg_floats > should create floats message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_floats([111, 222])
                    assert_integersEqual(msg_getLength(message), 2)
                    assert_floatsEqual(msg_readFloatToken(message, 0), 111)
                    assert_floatsEqual(msg_readFloatToken(message, 1), 222)
                `,
            },

            {
                description:
                    'msg_floats > should create empty floats message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_floats([])
                    assert_integersEqual(msg_getLength(message), 0)
                `,
            },

            {
                description: 'msg_strings > should create strings message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var(
                        'message',
                        'Message'
                    )} = msg_strings(['', 'blabla', 'blo'])
                    assert_integersEqual(msg_getLength(message), 3)
                    assert_stringsEqual(msg_readStringToken(message, 0), '')
                    assert_stringsEqual(msg_readStringToken(message, 1), 'blabla')
                    assert_stringsEqual(msg_readStringToken(message, 2), 'blo')
                `,
            },

            {
                description:
                    'msg_strings > should create empty strings message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_strings([])
                    assert_integersEqual(msg_getLength(message), 0)
                `,
            },

            {
                description: 'msg_isMatching > should match given message %s',
                codeGenerator: () => `
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([MSG_FLOAT_TOKEN]), 
                            [MSG_FLOAT_TOKEN]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([MSG_STRING_TOKEN, 1]), 
                            [MSG_STRING_TOKEN]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 1, MSG_FLOAT_TOKEN]), 
                            [MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, MSG_FLOAT_TOKEN]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([]), 
                            []
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([MSG_FLOAT_TOKEN, MSG_FLOAT_TOKEN]), 
                            [MSG_FLOAT_TOKEN]
                        ), 
                        false
                    )
                    assert_booleansEqual(
                        msg_isMatching(
                            msg_create([MSG_STRING_TOKEN, 1]), 
                            [MSG_FLOAT_TOKEN]
                        ), 
                        false
                    )
                `,
            },

            {
                description: 'msg_display > should return a display version of a message %s',
                codeGenerator: ({ macros: { Var }, target }) => `
                    const ${Var('message', 'Message')} = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 3])
                    msg_writeFloatToken(message, 0, -123)
                    msg_writeStringToken(message, 1, 'bla')
                    assert_stringsEqual(
                        msg_display(message),
                        ${target === 'assemblyscript' ? "'[-123.0, \"bla\"]'": "'[-123, \"bla\"]'"}
                    )
                `
            }
        ],
        [core.codeGenerator, msg.codeGenerator]
    )
})
