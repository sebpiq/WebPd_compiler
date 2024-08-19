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
import { AstVar, Code, AstConstVar, AstFunc, AstClass } from '../../ast/types'
import { PrecompiledCode, VariableNamesIndex } from '../precompile/types'
import { CompilationSettings } from '../types'

/**
 * Macros injected in code generators so that they can be written in a generic manner.
 * Each target language supported must implement the full set of macros.
 */
export interface CodeMacros {
    Var: (declaration: AstVar, renderedValue?: Code) => Code
    ConstVar: (declaration: AstConstVar, renderedValue: Code) => Code
    Func: (
        declaration: AstFunc,
        renderedArgsValues: Array<Code | null>,
        renderedBody: Code
    ) => Code
    Class: (declaration: AstClass) => Code
}

export interface RenderInput {
    readonly settings: Readonly<CompilationSettings>
    readonly precompiledCode: Readonly<PrecompiledCode>
    readonly variableNamesReadOnly: Readonly<VariableNamesIndex>
}

export type RenderTemplateInput = Omit<RenderInput, 'variableNamesReadOnly'> & {
    readonly globals: VariableNamesIndex['globals']
}
