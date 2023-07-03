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

import { runTestSuite } from './test-helpers'
import { core, msg } from '.'

describe('msg', () => {
    runTestSuite(
        [
            {
                description: 'msg_floats | should create floats message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_floats([111, 222])
                    assert_integersEqual(msg_getLength(message), 2)
                    assert_floatsEqual(msg_readFloatToken(message, 0), 111)
                    assert_floatsEqual(msg_readFloatToken(message, 1), 222)
                `,
            },

            {
                description:
                    'msg_floats | should create empty floats message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_floats([])
                    assert_integersEqual(msg_getLength(message), 0)
                `,
            },

            {
                description: 'msg_strings | should create strings message %s',
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
                    'msg_strings | should create empty strings message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    const ${Var('message', 'Message')} = msg_strings([])
                    assert_integersEqual(msg_getLength(message), 0)
                `,
            },

            {
                description: 'msg_isMatching | should match given message %s',
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
                description: 'msg_display | should return a display version of a message %s',
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
        [core, msg]
    )

    // const baseExports = {
    //     testReadMessageData: 1,
    // }

    // const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
    //     getAscCode('core.asc', bitDepth) +
    //     getAscCode('sked.asc', bitDepth) +
    //     getAscCode('commons.asc', bitDepth) +
    //     getAscCode('msg.asc', bitDepth) +
    //     `
    //         export function testReadMessageData(message: Message, index: Int): Int {
    //             return message.dataView.getInt32(index * sizeof<Int>())
    //         }

    //         export {
    //             // MSG EXPORTS
    //             x_msg_create as msg_create,
    //             x_msg_getTokenTypes as msg_getTokenTypes,
    //             x_msg_createTemplate as msg_createTemplate,
    //             msg_writeStringToken,
    //             msg_writeFloatToken,
    //             msg_readStringToken,
    //             msg_readFloatToken,
    //             MSG_FLOAT_TOKEN,
    //             MSG_STRING_TOKEN,

    //             // CORE EXPORTS
    //             createFloatArray,
    //             x_core_createListOfArrays as core_createListOfArrays,
    //             x_core_pushToListOfArrays as core_pushToListOfArrays,
    //             x_core_getListOfArraysLength as core_getListOfArraysLength,
    //             x_core_getListOfArraysElem as core_getListOfArraysElem,
    //         }
    //     `

    // describe('msg_floats / msg_strings', () => {
    //     it.each(TEST_PARAMETERS)(
    //         'should create floats message %s',
    //         async ({ bitDepth }) => {
    //             // prettier-ignore
    //             const code = getBaseTestCode(bitDepth) + `
    //             export function testCreateFloatsMessage(): Message {
    //                 return msg_floats([111, 222])
    //             }
    //             export function testCreateEmptyFloatsMessage(): Message {
    //                 return msg_floats([])
    //             }
    //         `

    //             const exports = {
    //                 ...baseExports,
    //                 testCreateFloatsMessage: 1,
    //                 testCreateEmptyFloatsMessage: 1,
    //             }

    //             const { wasmExports } = await initializeCoreCodeTest({
    //                 code,
    //                 bitDepth,
    //                 exports,
    //             })

    //             assert.deepStrictEqual(
    //                 liftMessage(
    //                     wasmExports,
    //                     wasmExports.testCreateFloatsMessage()
    //                 ),
    //                 [111, 222]
    //             )
    //             assert.deepStrictEqual(
    //                 liftMessage(
    //                     wasmExports,
    //                     wasmExports.testCreateEmptyFloatsMessage()
    //                 ),
    //                 []
    //             )
    //         }
    //     )

    //     it.each(TEST_PARAMETERS)(
    //         'should create strings message %s',
    //         async ({ bitDepth }) => {
    //             // prettier-ignore
    //             const code = getBaseTestCode(bitDepth) + `
    //             export function testCreateStringsMessage(): Message {
    //                 return msg_strings(['', 'blabla', 'blo'])
    //             }
    //             export function testCreateEmptyStringsMessage(): Message {
    //                 return msg_strings([])
    //             }
    //         `

    //             const exports = {
    //                 ...baseExports,
    //                 testCreateStringsMessage: 1,
    //                 testCreateEmptyStringsMessage: 1,
    //             }

    //             const { wasmExports } = await initializeCoreCodeTest({
    //                 code,
    //                 bitDepth,
    //                 exports,
    //             })

    //             assert.deepStrictEqual(
    //                 liftMessage(
    //                     wasmExports,
    //                     wasmExports.testCreateStringsMessage()
    //                 ),
    //                 ['', 'blabla', 'blo']
    //             )
    //             assert.deepStrictEqual(
    //                 liftMessage(
    //                     wasmExports,
    //                     wasmExports.testCreateEmptyStringsMessage()
    //                 ),
    //                 []
    //             )
    //         }
    //     )
    // })

    // describe('msg_isMatching', () => {
    //     it.each(TEST_PARAMETERS)(
    //         'should match given message %s',
    //         async ({ bitDepth }) => {
    //             // prettier-ignore
    //             const code = getBaseTestCode(bitDepth) + `
    //             export function testMatch1(): boolean {
    //                 const m: Message = msg_create([MSG_FLOAT_TOKEN])
    //                 return msg_isMatching(m, [MSG_FLOAT_TOKEN])
    //             }
    //             export function testMatch2(): boolean {
    //                 const m: Message = msg_create([MSG_STRING_TOKEN, 1])
    //                 return msg_isMatching(m, [MSG_STRING_TOKEN])
    //             }
    //             export function testMatch3(): boolean {
    //                 const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 1, MSG_FLOAT_TOKEN])
    //                 return msg_isMatching(m, [MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, MSG_FLOAT_TOKEN])
    //             }
    //             export function testMatch4(): boolean {
    //                 const m: Message = msg_create([])
    //                 return msg_isMatching(m, [])
    //             }
    //             export function testNotMatching1(): boolean {
    //                 const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_FLOAT_TOKEN])
    //                 return msg_isMatching(m, [MSG_FLOAT_TOKEN])
    //             }
    //             export function testNotMatching2(): boolean {
    //                 const m: Message = msg_create([MSG_STRING_TOKEN, 1])
    //                 return msg_isMatching(m, [MSG_FLOAT_TOKEN])
    //             }
    //         `

    //             const exports = {
    //                 ...baseExports,
    //                 testMatch1: 1,
    //                 testMatch2: 1,
    //                 testMatch3: 1,
    //                 testMatch4: 1,
    //                 testNotMatching1: 1,
    //                 testNotMatching2: 1,
    //             }

    //             const { wasmExports } = await initializeCoreCodeTest({
    //                 code,
    //                 bitDepth,
    //                 exports,
    //             })

    //             assert.ok(wasmExports.testMatch1())
    //             assert.ok(wasmExports.testMatch2())
    //             assert.ok(wasmExports.testMatch3())
    //             assert.ok(wasmExports.testMatch4())
    //             assert.ok(!wasmExports.testNotMatching1())
    //             assert.ok(!wasmExports.testNotMatching2())
    //         }
    //     )
    // })

    // describe('msg_display', () => {
    //     it.each(TEST_PARAMETERS)(
    //         'should return a display version of a message %s',
    //         async ({ bitDepth }) => {
    //             // prettier-ignore
    //             const code = getBaseTestCode(bitDepth) + `
    //             export function testDisplay(): string {
    //                 const m: Message = msg_create([MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 3])
    //                 msg_writeFloatToken(m, 0, -123)
    //                 msg_writeStringToken(m, 1, 'bla')
    //                 return msg_display(m)
    //             }
    //         `

    //             const exports = {
    //                 ...baseExports,
    //                 testDisplay: 1,
    //             }

    //             const { wasmExports } = await initializeCoreCodeTest({
    //                 code,
    //                 bitDepth,
    //                 exports,
    //             })

    //             assert.strictEqual(
    //                 liftString(wasmExports, wasmExports.testDisplay()),
    //                 '[-123.0, "bla"]'
    //             )
    //         }
    //     )
    // })
})
