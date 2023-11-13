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

/** Code stored in string variable for later evaluation. */
export type Code = string

/** Name of a variable in generated code */
export type CodeVariableName = string

export type TypeName = string



export interface AstElement {
    astType: string
}



export type AstContent =
    | VarDeclaration
    | ConstVarDeclaration
    | FuncDeclaration
    | ClassDeclaration
    | Code

export interface AstContainer extends AstElement {
    astType: 'Container'
    content: Array<AstContent>
}




export interface BaseVarDeclaration extends AstElement {
    name: CodeVariableName
    type: TypeName
    value?: AstContainer
}

export interface VarDeclaration extends BaseVarDeclaration {
    astType: 'Var'
}

export interface ConstVarDeclaration extends BaseVarDeclaration {
    astType: 'ConstVar'
}

export interface FuncDeclaration extends AstElement {
    astType: 'Func'
    name: CodeVariableName
    args: Array<VarDeclaration>
    returnType: TypeName
    body: AstContainer
}

export interface ClassDeclaration extends AstElement {
    astType: 'Class'
    name: CodeVariableName
    members: Array<VarDeclaration>
}

/**
 * Macros injected in code generators so that they can be written in a generic manner.
 * Each target language supported must implement the full set of macros.
 */
export type CodeMacros = {
    Var: (declaration: VarDeclaration, renderedValue: Code) => Code
    ConstVar: (declaration: ConstVarDeclaration, renderedValue: Code) => Code
    Func: (declaration: FuncDeclaration, renderedBody: Code) => Code
    Class: (declaration: ClassDeclaration) => Code
}
