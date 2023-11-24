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
import assert from 'assert'
import {
    ast,
    Sequence,
    Class,
    ConstVar,
    Func,
    Var,
    _processRawContent,
    AnonFunc,
} from './declare'
import { AstSequence, AstFunc } from './types'

describe('declare', () => {
    describe('_processRawContent', () => {
        it('should filter out null', () => {
            const someVar = Var('Int', 'bla')
            assert.deepStrictEqual(
                _processRawContent([null, 'a', someVar, null, 'b', null]),
                ['a', someVar, 'b']
            )
        })

        it('should combine adjacent strings', () => {
            const someVar = Var('Int', 'bla')
            assert.deepStrictEqual(
                _processRawContent(['a', 'b', someVar, 'c', 'd']),
                ['ab', someVar, 'cd']
            )
        })

        it('should convert numbers to strings', () => {
            assert.deepStrictEqual(_processRawContent([1, 'a', 2, 'b', 3]), [
                '1a2b3',
            ])
        })

        it('should recursively flatten arrays, add newlines between array elements and recusively combine strings', () => {
            const var1 = Var('Int', 'bla')
            const var2 = Var('Int', 'blu')
            const var3 = Var('Int', 'bli')
            assert.deepStrictEqual(
                _processRawContent([
                    ['a', 'b', var1],
                    'c',
                    ['d', ['e', 'f'], var2, 'g', 'h', var3, 'j'],
                    'k',
                ]),
                ['a\nb\n', var1, 'cd\ne\nf\n', var2, '\ng\nh\n', var3, '\njk']
            )
        })

        it('should expand AstSequence', () => {
            const var1 = Var('Int', 'bla')
            const var2 = Var('Int', 'blu')
            const ast1: AstSequence = {
                astType: 'Sequence',
                content: [var1, 'blo', var2],
            }

            const var3 = Var('Int', 'bli')
            const ast2: AstSequence = {
                astType: 'Sequence',
                content: [var3, 'bly'],
            }
            assert.deepStrictEqual(
                _processRawContent([ast1, ['a', ast2], 'b']),
                [var1, 'blo', var2, 'a\n', var3, 'blyb']
            )
        })

        it('should leave other AST elements untouched', () => {
            const var1 = Var('Int', 'bla')
            const var2 = Var('Int', 'blu')
            const func1 = Func('myFunc')`
                ${var1}
                ${var2}
            `

            const var3 = Var('Int', 'bli')
            const class1 = Class('myClass', [var3])

            assert.deepStrictEqual(
                _processRawContent([func1, ['a', class1], 'b']),
                [func1, 'a\n', class1, 'b']
            )
        })
    })

    describe('Sequence', () => {
        it('should intersperse newlines between elements', () => {
            const var1 = Var('Int', 'bla')
            const sequence = Sequence(['a', 'b', var1, 'c'])
            assert.deepStrictEqual<AstSequence>(sequence, {
                astType: 'Sequence',
                content: ['a\nb\n', var1, '\nc'],
            })
        })
    })

    describe('Ast', () => {
        it('should intersperse newlines between array elements, but not mess with top-level strings', () => {
            const var1 = Var('Int', 'bla', '1')
            const var2 = ConstVar('Int', 'blu', '3')
            const sequence = ast`
                ${var1}
                bla = 2
                ${var2}`
            assert.deepStrictEqual<AstSequence>(sequence, {
                astType: 'Sequence',
                content: [
                    '\n                ',
                    var1,
                    '\n                bla = 2\n                ',
                    var2,
                ],
            })
        })
    })

    describe('Func', () => {
        it('should allow to declare a function', () => {
            const astFunc = Func(
                'myFunc',
                [Var('number', 'arg1'), Var('string', 'arg2')],
                'void'
            )`const a = 1`

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [
                    {
                        astType: 'Var',
                        name: 'arg1',
                        type: 'number',
                        value: undefined,
                    },
                    {
                        astType: 'Var',
                        name: 'arg2',
                        type: 'string',
                        value: undefined,
                    },
                ],
                returnType: 'void',
                body: {
                    astType: 'Sequence',
                    content: ['const a = 1'],
                },
            })
        })

        it('should allow function body to declare variables', () => {
            const astFunc = Func('myFunc', [], 'string')`
                ${Var('number', 'a', '1')}
                ${ConstVar('string', 'b', '"HELLO"')}
                return b`

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [],
                returnType: 'string',
                body: {
                    astType: 'Sequence',
                    content: [
                        '\n                ',
                        {
                            astType: 'Var',
                            name: 'a',
                            type: 'number',
                            value: { astType: 'Sequence', content: ['1'] },
                        },
                        '\n                ',
                        {
                            astType: 'ConstVar',
                            name: 'b',
                            type: 'string',
                            value: {
                                astType: 'Sequence',
                                content: ['"HELLO"'],
                            },
                        },
                        '\n                return b',
                    ],
                },
            })
        })

        it('should allow function body to declare functions', () => {
            const astFunc = Func('myFunc', [], 'string')`
                ${Func('myFunc2')`
                    return
                `}
                return 'hello'
            `

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [],
                returnType: 'string',
                body: {
                    astType: 'Sequence',
                    content: [
                        '\n                ',
                        {
                            astType: 'Func',
                            name: 'myFunc2',
                            args: [],
                            returnType: 'void',
                            body: {
                                astType: 'Sequence',
                                content: [
                                    '\n                    return\n                ',
                                ],
                            },
                        },
                        "\n                return 'hello'\n            ",
                    ],
                },
            })
        })

        it('should have default values for args and returnType', () => {
            const astFunc = Func('myFunc')``

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [],
                returnType: 'void',
                body: {
                    astType: 'Sequence',
                    content: [],
                },
            })
        })
    })

    describe('AnonFunc', () => {
        it('should allow to declare an anonymous function', () => {
            const astFunc = AnonFunc(
                [Var('number', 'arg1')],
                'void'
            )`const a = 1`

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: null,
                args: [
                    {
                        astType: 'Var',
                        name: 'arg1',
                        type: 'number',
                        value: undefined,
                    },
                ],
                returnType: 'void',
                body: {
                    astType: 'Sequence',
                    content: ['const a = 1'],
                },
            })
        })

        it('should have default values for args and returnType', () => {
            const astFunc = AnonFunc()``

            assert.deepStrictEqual<AstFunc>(astFunc, {
                astType: 'Func',
                name: null,
                args: [],
                returnType: 'void',
                body: {
                    astType: 'Sequence',
                    content: [],
                },
            })
        })
    })

    describe('Var', () => {
        it('should accept value as number', () => {
            const var1 = Var('Int', 'bla', 1)
            assert.deepStrictEqual(var1, {
                astType: 'Var',
                name: 'bla',
                type: 'Int',
                value: { astType: 'Sequence', content: ['1'] },
            })
        })
    })
})
