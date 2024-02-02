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

import { AstConstVar, AstFunc, AstVar } from '../../ast/types'
import { CodeMacros } from "../../compile/render/types"
import { Code } from '../../ast/types'

const Var = (declaration: AstVar, renderedValue?: Code) =>
`let ${declaration.name}${renderedValue ? ` = ${renderedValue}` : ''}`

const ConstVar = (declaration: AstConstVar, renderedValue: Code) =>
    `const ${declaration.name} = ${renderedValue}`

const Func = (declaration: AstFunc, renderedArgsValues: Array<Code | null>, renderedBody: Code) => 
    `function ${declaration.name !== null ? declaration.name: ''}(${
        declaration.args.map((arg, i) => 
            renderedArgsValues[i] ? `${arg.name}=${renderedArgsValues[i]}`: arg.name).join(', ')
    }) {${renderedBody}}`

const Class = () => 
    ``

const macros: CodeMacros = {
    Var,
    ConstVar,
    Func,
    Class,
}

export default macros
