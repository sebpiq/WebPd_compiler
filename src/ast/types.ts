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

/** 
 * Code string, either provided as part of an AST, 
 * or the result of a compilation operation 
 */
export type Code = string

/** Name of a variable */
export type VariableName = string

/** Name of a type */
export type TypeName = string

/** Base type for all AST elements */
export interface AstElementBase {
    astType: string
}

export type AstElement = AstSequence | AstVar | AstConstVar | AstFunc | AstClass

export type AstSequenceContent =
    | AstVar
    | AstConstVar
    | AstFunc
    | AstClass
    | Code

export interface AstSequence extends AstElementBase {
    astType: 'Sequence'
    content: Array<AstSequenceContent>
}

export interface AstVarBase extends AstElementBase {
    name: VariableName
    type: TypeName
    value?: AstElement
}

export interface AstVar extends AstVarBase {
    astType: 'Var'
}

export interface AstConstVar extends AstVarBase {
    astType: 'ConstVar'
    value: AstElement
}

export interface AstFunc extends AstElementBase {
    astType: 'Func'
    name: VariableName | null
    args: Array<AstVar>
    returnType: TypeName
    body: AstSequence
}

export interface AstClass extends AstElementBase {
    astType: 'Class'
    name: VariableName
    members: Array<AstVar>
}

/**
 * Macros injected in code generators so that they can be written in a generic manner.
 * Each target language supported must implement the full set of macros.
 */
export type CodeMacros = {
    Var: (declaration: AstVar, renderedValue: Code) => Code
    ConstVar: (declaration: AstConstVar, renderedValue: Code) => Code
    Func: (declaration: AstFunc, renderedArgsValues: Array<Code | null>, renderedBody: Code) => Code
    Class: (declaration: AstClass) => Code
}
