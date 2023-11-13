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
import assert from "assert"
import macros from "../engine-assemblyscript/compile/macros"
import { ast, Var, ConstVar, Func, Class } from "./declare"
import render from "./render"

describe('render', () => {
    it('should render a simple string', () => {
        const sequence = ast`const a = 1`
        const rendered = render(macros, sequence)
        assert.strictEqual(rendered, 'const a = 1')
    })

    it('should render Var and ConstVar properly', () => {
        const sequence = ast`
            ${Var('number', 'a', '1')}
            ${ConstVar('string', 'b', '"HELLO"')}
        `
        const rendered = render(macros, sequence)
        assert.strictEqual(rendered, `
            let a: number = 1
            const b: string = "HELLO"
        `)
    })

    it('should render Func properly', () => {
        const sequence = ast`
            // My function documentation
            ${Func('myFunc', [
                Var('Int', 'arg1')
            ], 'string')`
                ${Var('number', 'a', '1')}
                ${ConstVar('string', 'b', '"HELLO"')}
                return b + a.toString() + arg1.toString()
            `}
        `
        const rendered = render(macros, sequence)
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
        const sequence = ast`
            ${Class('MyClass', [
                Var('Int', 'a'),
                Var('Int', 'b')
            ])}
        `
        const rendered = render(macros, sequence)
        assert.strictEqual(rendered, `
            class MyClass {
a: Int
b: Int
}
        `)
    })
})