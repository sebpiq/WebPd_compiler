import assert from 'assert'
import { Class, ConstVar, Func, Var } from '../../ast/declare'
import macros from './macros'

describe('macros', () => {
    it('should generate a Var declaration', () => {
        const var1 = Var('Int', 'a')
        assert.strictEqual(macros.Var(var1, '1'), 'let a: Int = 1')
    })

    it('should generate a ConstVar declaration', () => {
        const var1 = ConstVar('string', 'a', 'BLOOOOoo')
        assert.strictEqual(
            macros.ConstVar(var1, '"bla"'),
            'const a: string = "bla"'
        )
    })

    it('should generate a Func declaration', () => {
        const func1 = Func(
            'myFunc',
            [Var('Int', 'a')],
            'string'
        )`return (a + 1).toString()`
        assert.strictEqual(
            macros.Func(func1, 'return (a + 1).toString()'),
            'function myFunc(a: Int): string {return (a + 1).toString()}'
        )
    })

    it('should generate a Class declaration', () => {
        const class1 = Class('MyClass', [Var('Int', 'a'), Var('Float', 'b')])
        assert.strictEqual(
            macros.Class(class1),
            `class MyClass {
a: Int
b: Float
}`
        )
    })
})
