import assert from 'assert'
import { ConstVar, Func, Var } from './declare'

describe('declare', () => {

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
                    { astType: 'Var', name: 'arg1', type: 'number', value: undefined },
                    { astType: 'Var', name: 'arg2', type: 'string', value: undefined },
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
                            value: {astType: 'Container', content: ['1']},
                        },
                        '\n                ',
                        {
                            astType: 'ConstVar',
                            name: 'b',
                            type: 'string',
                            value: {astType: 'Container', content: ['"HELLO"']},
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
                                content: ['\n                    return\n                '],
                            },
                        },
                        "\n                return 'hello'\n            ",
                    ],
                },
            })
        })
    })
})
