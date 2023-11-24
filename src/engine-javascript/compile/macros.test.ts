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
import { Class, ConstVar, Func, Var } from '../../ast/declare'
import macros from './macros'
import render from '../../ast/render'

describe('macros', () => {
    it('should render a Var declaration', () => {
        const var1 = Var('Int', 'a')
        assert.strictEqual(macros.Var(var1, '1'), 'let a = 1')
    })

    it('should render a Var declaration with undefined value', () => {
        const var1 = Var('Int', 'a')
        assert.strictEqual(macros.Var(var1, undefined), 'let a')
    })

    it('should render a ConstVar declaration', () => {
        const var1 = ConstVar('string', 'a', 'BLOOOOoo')
        assert.strictEqual(macros.ConstVar(var1, '"bla"'), 'const a = "bla"')
    })

    it('should render a Func declaration', () => {
        const func1 = Func(
            'myFunc',
            [Var('Int', 'a'), Var('string', 'b', '"bla"')],
            'string'
        )`return (a + 1).toString() + b`

        const renderedArgsValues = func1.args.map((arg) =>
            arg.value ? render(macros, arg.value) : null
        )
        const renderedBody = render(macros, func1.body)

        assert.strictEqual(
            macros.Func(func1, renderedArgsValues, renderedBody),
            'function myFunc(a, b="bla") {return (a + 1).toString() + b}'
        )
    })

    it('should render a Class declaration', () => {
        const class1 = Class('MyClass', [Var('Int', 'a'), Var('Float', 'b')])
        assert.strictEqual(macros.Class(class1), ``)
    })
})
