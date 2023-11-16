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
import { AnonFunc, Class, ConstVar, Func, Var } from '../../ast/declare'
import macros from './macros'

describe('macros', () => {
    it('should render a Var declaration', () => {
        const var1 = Var('Int', 'a')
        assert.strictEqual(macros.Var(var1, '1'), 'let a: Int = 1')
    })

    it('should render a Var declaration with undefined value', () => {
        const var1 = Var('Int', 'a')
        assert.strictEqual(macros.Var(var1, undefined), 'let a: Int')
    })

    it('should render a ConstVar declaration', () => {
        const var1 = ConstVar('string', 'a', 'BLOOOOoo')
        assert.strictEqual(
            macros.ConstVar(var1, '"bla"'),
            'const a: string = "bla"'
        )
    })

    it('should render a Func declaration', () => {
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

    it('should render an anonymous Func declaration', () => {
        const func1 = AnonFunc(
            [Var('Int', 'a')],
            'string'
        )`return (a + 1).toString()`
        assert.strictEqual(
            macros.Func(func1, 'return (a + 1).toString()'),
            'function (a: Int): string {return (a + 1).toString()}'
        )
    })

    it('should render a Class declaration', () => {
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
