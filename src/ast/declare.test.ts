import assert from 'assert'
import {
    Ast,
    AstRaw,
    Class,
    ConstVar,
    Func,
    Var,
    _processRawContent,
} from './declare'
import { AstContainer } from './types'

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

        it('should expand AstContainer', () => {
            const var1 = Var('Int', 'bla')
            const var2 = Var('Int', 'blu')
            const ast1: AstContainer = {
                astType: 'Container',
                content: [var1, 'blo', var2],
            }

            const var3 = Var('Int', 'bli')
            const ast2: AstContainer = {
                astType: 'Container',
                content: [var3, 'bly'],
            }
            assert.deepStrictEqual(
                _processRawContent([ast1, ['a', ast2], 'b']),
                [var1, 'blo', var2, 'a\n', var3, 'blyb']
            )
        })

        it('should leave other ast elements untouched', () => {
            const var1 = Var('Int', 'bla')
            const var2 = Var('Int', 'blu')
            const func1 = Func('myFunc', [], 'void')`
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

    describe('AstRaw', () => {
        it('should intersperse newlines between elements', () => {
            const var1 = Var('Int', 'bla')
            const ast = AstRaw(['a', 'b', var1, 'c'])
            assert.deepStrictEqual(ast, {
                astType: 'Container',
                content: ['a\nb\n', var1, '\nc'],
            })
        })
    })

    describe('Ast', () => {
        it('should intersperse newlines between array elements, but not mess with top-level strings', () => {
            const var1 = Var('Int', 'bla', '1')
            const var2 = ConstVar('Int', 'blu', '3')
            const ast = Ast`
                ${var1}
                bla = 2
                ${var2}`
            assert.deepStrictEqual(ast, {
                astType: 'Container',
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

            assert.deepStrictEqual(astFunc, {
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
                    astType: 'Container',
                    content: ['const a = 1'],
                },
            })
        })

        it('should allow function body to declare variables', () => {
            const astFunc = Func('myFunc', [], 'string')`
                ${Var('number', 'a', '1')}
                ${ConstVar('string', 'b', '"HELLO"')}
                return b`

            assert.deepStrictEqual(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [],
                returnType: 'string',
                body: {
                    astType: 'Container',
                    content: [
                        '\n                ',
                        {
                            astType: 'Var',
                            name: 'a',
                            type: 'number',
                            value: { astType: 'Container', content: ['1'] },
                        },
                        '\n                ',
                        {
                            astType: 'ConstVar',
                            name: 'b',
                            type: 'string',
                            value: {
                                astType: 'Container',
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
                ${Func('myFunc2', [], 'void')`
                    return
                `}
                return 'hello'
            `

            assert.deepStrictEqual(astFunc, {
                astType: 'Func',
                name: 'myFunc',
                args: [],
                returnType: 'string',
                body: {
                    astType: 'Container',
                    content: [
                        '\n                ',
                        {
                            astType: 'Func',
                            name: 'myFunc2',
                            args: [],
                            returnType: 'void',
                            body: {
                                astType: 'Container',
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
    })
})
