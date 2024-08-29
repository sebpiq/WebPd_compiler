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
import macros from '../../engine-assemblyscript/compile/macros'
import { ast, Var, ConstVar, Func, Class, AnonFunc } from '../../ast/declare'
import render from '.'

describe('render', () => {
    it('should render a simple string', () => {
        const rendered = render(macros, `const a = 1`)
        assert.strictEqual(rendered, 'const a = 1')
    })

    it('should render Var and ConstVar properly', () => {
        assert.strictEqual(
            render(macros, Var(`number`, `a`, `1`)),
            `let a: number = 1`
        )
        assert.strictEqual(render(macros, Var(`number`, `a`)), `let a: number`)
        assert.strictEqual(
            render(macros, ConstVar(`string`, `b`, `"HELLO"`)),
            `const b: string = "HELLO"`
        )
    })

    it('should render Func properly', () => {
        const func = Func(
            'myFunc',
            [
                Var(`Int`, `arg1`),
                Var(
                    'Array<(a: Int) => void>',
                    'arg2',
                    ast`[${AnonFunc([Var(`Int`, `a`)])``}]`
                ),
            ],
            'string'
        )`
            ${Var(`number`, `a`, `1`)}
            ${ConstVar(`string`, `b`, `"HELLO"`)}
            return b + a.toString() + arg1.toString()
        `
        assert.strictEqual(
            render(macros, func),
            `function myFunc(arg1: Int, arg2: Array<(a: Int) => void>=[function (a: Int): void {}]): string {
            let a: number = 1
            const b: string = "HELLO"
            return b + a.toString() + arg1.toString()
        }`
        )
    })

    it('should render Class properly', () => {
        const cls = Class('MyClass', [Var(`Int`, `a`), Var(`string`, `b`)])
        assert.strictEqual(
            render(macros, cls),
            `class MyClass {
a: Int
b: string
}`
        )
    })

    it('should render a Sequence properly', () => {
        const sequence = ast`
            ${Var(`number`, `a`, `1`)}
            ${ConstVar(`string`, `b`, `"HELLO"`)}
            // My function documentation
            ${Func('myFunc', [Var(`Int`, `arg1`)], `string`)`
                ${Var(`number`, `a`, `1`)}
                ${ConstVar(`string`, `b`, `"HELLO"`)}
                return b + a.toString() + arg1.toString()
            `}
            ${Class('MyClass', [Var(`Int`, `a`), Var(`Float`, `b`)])}`

        assert.strictEqual(
            render(macros, sequence),
            `
            let a: number = 1
            const b: string = "HELLO"
            // My function documentation
            function myFunc(arg1: Int): string {
                let a: number = 1
                const b: string = "HELLO"
                return b + a.toString() + arg1.toString()
            }
            class MyClass {
a: Int
b: Float
}`
        )
    })
})
