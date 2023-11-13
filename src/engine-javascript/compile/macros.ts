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

import { ClassDeclaration, CodeMacros, ConstVarDeclaration, FuncDeclaration, VarDeclaration } from '../../ast/types'
import { Code } from '../../ast/types'

const Var = (declaration: VarDeclaration, renderedValue: Code) =>
    `let ${declaration.name} = ${renderedValue}`

const ConstVar = (declaration: ConstVarDeclaration, renderedValue: Code) =>
    `const ${declaration.name} = ${renderedValue}`

const Func = (declaration: FuncDeclaration, renderedBody: Code) => 
    `function ${declaration.name}(${declaration.args.map(arg => arg.name).join(', ')}) {${renderedBody}}`

const Class = (declaration: ClassDeclaration) => 
    ``

const macros: CodeMacros = {
    Var,
    ConstVar,
    Func,
    Class,
}

export default macros
