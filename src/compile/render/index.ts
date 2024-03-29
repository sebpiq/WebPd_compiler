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
import { AstElement, Code } from '../../ast/types'
import { CodeMacros } from './types'

const render = (macros: CodeMacros, element: AstElement | string): Code => {
    if (typeof element === 'string') {
        return element
    } else if (element.astType === 'Var') {
        return element.value
            ? macros.Var(element, render(macros, element.value))
            : macros.Var(element)
    } else if (element.astType === 'ConstVar') {
        if (!element.value) {
            throw new Error(
                `ConstVar ${element.name} must have an initial value`
            )
        }
        return macros.ConstVar(element, render(macros, element.value))
    } else if (element.astType === 'Func') {
        return macros.Func(
            element,
            element.args.map((arg) =>
                arg.value ? render(macros, arg.value) : null
            ),
            render(macros, element.body)
        )
    } else if (element.astType === 'Class') {
        return macros.Class(element)
    } else if (element.astType === 'Sequence') {
        return element.content.map((child) => render(macros, child)).join('')
    } else {
        throw new Error(`Unexpected element in AST ${element}`)
    }
}

export default render
