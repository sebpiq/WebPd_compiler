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
import { AstElement, AstSequenceContent, Code, VariableName } from './types'
import {
    TypeName,
    AstVar,
    AstConstVar,
    AstSequence,
    AstFunc,
    AstClass,
} from './types'

type AstContentRaw = AstSequenceContent | AstSequence | null | number

type AstContentRawNested = Array<AstContentRawNested | AstContentRaw>

export type AstVarValue = Code | number | AstElement

export const Var = (
    typeName: TypeName,
    name: VariableName,
    value?: AstVarValue
): AstVar =>
    _preventToString({
        astType: 'Var',
        name,
        type: typeName,
        value: value !== undefined ? _prepareVarValue(value) : undefined,
    })

export const ConstVar = (
    typeName: TypeName,
    name: VariableName,
    value: AstVarValue
): AstConstVar =>
    _preventToString({
        astType: 'ConstVar',
        name,
        type: typeName,
        value: _prepareVarValue(value),
    })

export const Func =
    (name: string, args: Array<AstVar> = [], returnType: Code = 'void') =>
    (strings: ReadonlyArray<Code>, ...content: AstContentRawNested): AstFunc =>
        _preventToString({
            astType: 'Func',
            name,
            args,
            returnType,
            body: ast(strings, ...content),
        })

export const AnonFunc =
    (args: Array<AstVar> = [], returnType: Code = 'void') =>
    (strings: ReadonlyArray<Code>, ...content: AstContentRawNested): AstFunc =>
        _preventToString({
            astType: 'Func',
            name: null,
            args,
            returnType,
            body: ast(strings, ...content),
        })

export const Class = (name: string, members: Array<AstVar>): AstClass =>
    _preventToString({
        astType: 'Class',
        name,
        members,
    })

export const Sequence = (content: AstContentRawNested): AstSequence => ({
    astType: 'Sequence',
    content: _processRawContent(
        _intersperse(
            content,
            countTo(content.length - 1).map(() => '\n')
        )
    ),
})

export const ast = (
    strings: ReadonlyArray<Code>,
    ...content: AstContentRawNested
): AstSequence =>
    _preventToString({
        astType: 'Sequence',
        content: _processRawContent(_intersperse(strings, content)),
    })

export const _processRawContent = (
    content: AstContentRawNested
): Array<AstSequenceContent> => {
    // 1. Flatten arrays and AstSequence, filter out nulls, and convert numbers to strings
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
                element.astType === 'Sequence'
            ) {
                return element.content
            } else {
                return [element]
            }
        }
    })

    // 2. Combine adjacent strings
    const [combinedContent, remainingString] = flattenedAndFiltered.reduce<
        [Array<AstSequenceContent>, string]
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
    array2: Readonly<AstContentRawNested>,
): AstContentRawNested => {
    if (array1.length === 0) {
        return []
    }
    return array1
        .slice(1)
        .reduce<AstContentRawNested>(
            (combinedContent, element, i) => {
                return combinedContent.concat([array2[i]!, element])
            },
            [array1[0]!]
        )
}

/**
 * Prevents AST elements from being rendered as a string, as this is
 * most likely an error due to unproper use of `ast`.
 * Deacivated. Activate for debugging by uncommenting the line below.
 */
const _preventToString = <T>(element: T): T => ({
    ...element,
    // Uncomment this to activate
    // toString: () => { throw new Error(`Rendering element ${elemennt.astType} as string is probably an error`) }
})

const _prepareVarValue = (value: AstVarValue) => {
    if (typeof value === 'number') {
        return Sequence([value.toString()])
    } else if (typeof value === 'string') {
        return Sequence([value])
    } else {
        return value
    }
}
