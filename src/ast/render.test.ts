import assert from "assert"
import macros from "../engine-assemblyscript/compile/macros"
import { Ast, Var, ConstVar, Func, Class } from "./declare"
import render from "./render"

describe('render', () => {
    it('should render a simple string', () => {
        const ast = Ast`const a = 1`
        const rendered = render(macros, ast)
        assert.strictEqual(rendered, 'const a = 1')
    })

    it('should render Var and ConstVar properly', () => {
        const ast = Ast`
            ${Var('number', 'a', '1')}
            ${ConstVar('string', 'b', '"HELLO"')}
        `
        const rendered = render(macros, ast)
        assert.strictEqual(rendered, `
            let a: number = 1
            const b: string = "HELLO"
        `)
    })

    it('should render Func properly', () => {
        const ast = Ast`
            // My function documentation
            ${Func('myFunc', [
                Var('Int', 'arg1')
            ], 'string')`
                ${Var('number', 'a', '1')}
                ${ConstVar('string', 'b', '"HELLO"')}
                return b + a.toString() + arg1.toString()
            `}
        `
        const rendered = render(macros, ast)
        assert.strictEqual(rendered, `
            // My function documentation
            function myFunc(arg1: Int): string {
                let a: number = 1
                const b: string = "HELLO"
                return b + a.toString() + arg1.toString()
            }
        `)
    })

    it('should render Class properly', () => {
        const ast = Ast`
            ${Class('MyClass', [
                Var('Int', 'a'),
                Var('Int', 'b')
            ])}
        `
        const rendered = render(macros, ast)
        assert.strictEqual(rendered, `
            class MyClass {
a: Int
b: Int
}
        `)
    })
})