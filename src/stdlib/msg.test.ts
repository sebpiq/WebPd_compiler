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

import { AnonFunc, ConstVar } from '../ast/declare'
import { runTestSuite } from '../test-helpers'
import { core } from './core'
import { msg } from './msg'

describe('msg', () => {
    runTestSuite(
        [
            {
                description: 'floats > should create floats message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    ${ConstVar(
                        globalCode.msg!.Message!, 
                        'message', 
                        `${globalCode.msg!.floats!}([111, 222])`
                    )}
                    assert_integersEqual(${globalCode.msg!.getLength!}(message), 2)
                    assert_floatsEqual(${globalCode.msg!.readFloatToken!}(message, 0), 111)
                    assert_floatsEqual(${globalCode.msg!.readFloatToken!}(message, 1), 222)
                `,
            },

            {
                description:
                    'floats > should create empty floats message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    ${ConstVar(
                        globalCode.msg!.Message!, 
                        'message', 
                        `${globalCode.msg!.floats!}([])`
                    )}
                    assert_integersEqual(${globalCode.msg!.getLength!}(message), 0)
                `,
            },

            {
                description: 'strings > should create strings message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    ${ConstVar(
                        globalCode.msg!.Message!,
                        'message',
                        `${globalCode.msg!.strings!}(['', 'blabla', 'blo'])`,
                    )}
                    assert_integersEqual(${globalCode.msg!.getLength!}(message), 3)
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(message, 0), '')
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(message, 1), 'blabla')
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(message, 2), 'blo')
                `,
            },

            {
                description:
                    'strings > should create empty strings message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    ${ConstVar(
                        globalCode.msg!.Message!, 
                        'message', 
                        `${globalCode.msg!.strings!}([])`
                    )}
                    assert_integersEqual(${globalCode.msg!.getLength!}(message), 0)
                `,
            },

            {
                description: 'isMatching > should match given message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([${globalCode.msg!.FLOAT_TOKEN!}]), 
                            [${globalCode.msg!.FLOAT_TOKEN!}]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([${globalCode.msg!.STRING_TOKEN!}, 1]), 
                            [${globalCode.msg!.STRING_TOKEN!}]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([
                                ${globalCode.msg!.FLOAT_TOKEN!}, 
                                ${globalCode.msg!.STRING_TOKEN!}, 
                                1, 
                                ${globalCode.msg!.FLOAT_TOKEN!}
                            ]), 
                            [${globalCode.msg!.FLOAT_TOKEN!}, ${globalCode.msg!.STRING_TOKEN!}, ${globalCode.msg!.FLOAT_TOKEN!}]
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([]), 
                            []
                        ), 
                        true
                    )
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([${globalCode.msg!.FLOAT_TOKEN!}, ${globalCode.msg!.FLOAT_TOKEN!}]), 
                            [${globalCode.msg!.FLOAT_TOKEN!}]
                        ), 
                        false
                    )
                    assert_booleansEqual(
                        ${globalCode.msg!.isMatching!}(
                            ${globalCode.msg!.create!}([${globalCode.msg!.STRING_TOKEN!}, 1]), 
                            [${globalCode.msg!.FLOAT_TOKEN!}]
                        ), 
                        false
                    )
                `,
            },

            {
                description:
                    'display > should return a display version of a message %s',
                testFunction: ({ globalCode, target }) => AnonFunc()`
                    ${ConstVar(
                        globalCode.msg!.Message!,
                        'message',
                        `${globalCode.msg!.create!}([
                            ${globalCode.msg!.FLOAT_TOKEN!}, 
                            ${globalCode.msg!.STRING_TOKEN!}, 
                            3
                        ])`,
                    )}
                    ${globalCode.msg!.writeFloatToken!}(message, 0, -123)
                    ${globalCode.msg!.writeStringToken!}(message, 1, 'bla')
                    assert_stringsEqual(
                        ${globalCode.msg!.display!}(message),
                        ${
                            target === 'assemblyscript'
                                ? '\'[-123.0, "bla"]\''
                                : '\'[-123, "bla"]\''
                        }
                    )
                `,
            },
        ],
        [core.codeGenerator, msg.codeGenerator]
    )
})
