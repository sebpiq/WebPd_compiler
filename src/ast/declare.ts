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
import { countTo } from '../functional-helpers'
import { AstContent, AstElement, Code, CodeVariableName } from './types'
import {
    TypeName,
    VarDeclaration,
    ConstVarDeclaration,
    AstContainer,
    FuncDeclaration,
    ClassDeclaration,
} from './types'

type AstContentRaw = AstContent | AstContainer | null | number

type AstContentRawNested = Array<AstContentRawNested | AstContentRaw>

export const Var = (
    typeName: TypeName,
    name: CodeVariableName,
    value?: Code | AstContainer
): VarDeclaration =>
    _preventToString({
        astType: 'Var',
        name,
        type: typeName,
        value: typeof value === 'string' ? AstRaw([value]) : value,
    })

export const ConstVar = (
    typeName: TypeName,
    name: CodeVariableName,
    value?: Code | AstContainer
): ConstVarDeclaration =>
    _preventToString({
        astType: 'ConstVar',
        name,
        type: typeName,
        value: typeof value === 'string' ? AstRaw([value]) : value,
    })

export const Func =
    (name: string, args: Array<VarDeclaration>, returnType: Code) =>
    (
        strings: ReadonlyArray<Code>,
        ...content: AstContentRawNested
    ): FuncDeclaration =>
        _preventToString({
            astType: 'Func',
            name,
            args,
            returnType,
            body: Ast(strings, ...content),
        })

export const Class = (
    name: string,
    members: Array<VarDeclaration>
): ClassDeclaration =>
    _preventToString({
        astType: 'Class',
        name,
        members,
    })

export const Ast = (
    strings: ReadonlyArray<Code>,
    ...content: AstContentRawNested
): AstContainer =>
    _preventToString({
        astType: 'Container',
        content: _processRawContent(_intersperse(strings, content)),
    })

export const AstRaw = (content: AstContentRawNested): AstContainer => ({
    astType: 'Container',
    content: _processRawContent(
        _intersperse(
            content,
            countTo(content.length - 1).map(() => '\n')
        )
    ),
})

export const _processRawContent = (
    content: AstContentRawNested
): Array<AstContent> => {
    // 1. Flatten arrays and AstContainer, filter out nulls, and convert numbers to strings
    // Basically converts input to an Array<AstContent>.
    const flattenedAndFiltered = content.flatMap((element) => {
        if (typeof element === 'string') {
            return [element]
        } else if (typeof element === 'number') {
            return [element.toString()]
        } else {
            if (element === null) {
                return []
            } else if (Array.isArray(element)) {
                return _processRawContent(
                    _intersperse(
                        element,
                        countTo(element.length - 1).map(() => '\n')
                    )
                )
            } else if (
                typeof element === 'object' &&
                element.astType === 'Container'
            ) {
                return element.content
            } else {
                return [element]
            }
        }
    })

    // 2. Combine adjacent strings
    const [combinedContent, remainingString] = flattenedAndFiltered.reduce<
        [Array<AstContent>, string]
    >(
        ([combinedContent, currentString], element) => {
            if (typeof element === 'string') {
                return [combinedContent, currentString + element]
            } else {
                if (currentString.length) {
                    return [[...combinedContent, currentString, element], '']
                } else {
                    return [[...combinedContent, element], '']
                }
            }
        },
        [[], '']
    )
    if (remainingString.length) {
        combinedContent.push(remainingString)
    }

    return combinedContent
}

/**
 * Intersperse content from array1 with content from array2.
 * `array1.length` must be equal to `array2.length + 1`.
 */
const _intersperse = (
    array1: Readonly<AstContentRawNested>,
    array2: Readonly<AstContentRawNested>
): AstContentRawNested => {
    if (array1.length === 0) {
        return []
    }
    return array1
        .slice(1)
        .reduce<AstContentRawNested>(
            (combinedContent, element, i) =>
                combinedContent.concat([array2[i], element]),
            [array1[0]]
        )
}

const _preventToString = <T extends AstElement>(element: T): T => ({
    ...element,
    // toString: () => {
    //     throw new Error(`Rendering element ${element.astType} as string is probably an error`)
    // }
})
