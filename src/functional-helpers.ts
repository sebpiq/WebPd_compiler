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

import { Code } from './compile/types'

type CodeLines = Array<CodeLines | Code | number>

/**
 * Renders templated strings which contain nested arrays of strings.
 * This helper allows to use functions such as `.map` to generate several lines
 * of code, without having to use `.join('\n')`.
 * @todo : should not have to check for falsy codeLine has it should be typechecked.
 */
export const renderCode = (
    strings: TemplateStringsArray,
    ...codeLines: CodeLines
): Code => {
    let rendered: string = ''
    for (let i = 0; i < strings.length; i++) {
        rendered += strings[i]
        if (codeLines[i] || codeLines[i] === 0) {
            rendered += _renderCodeRecursive(codeLines[i])
        }
    }
    return rendered
}

const _renderCodeRecursive = (codeLines: CodeLines | Code | number): Code => {
    if (Array.isArray(codeLines)) {
        return codeLines
            .map(_renderCodeRecursive)
            .filter((line) => line.length)
            .join('\n')
    }
    return codeLines.toString()
}

/** Generate an integer series from 0 to `count` (non-inclusive). */
export const countTo = (count: number) => {
    const results: Array<number> = []
    for (let i = 0; i < count; i++) {
        results.push(i)
    }
    return results
}

/**
 * @returns Generates a new object with the same keys as `src` and whose
 * values are the result of mapping `src`'s values with `func`.
 *
 * @todo : fix typings so that keys of SrcType appear in DestType.
 */
export const mapObject = <SrcType, DestType>(
    src: { [key: string]: SrcType },
    func: (value: SrcType, key: string, index: number) => DestType
): { [key: string]: DestType } => {
    const dest: { [key: string]: DestType } = {}
    Object.entries(src).forEach(([key, srcValue], i) => {
        dest[key] = func(srcValue, key, i)
    })
    return dest
}

/**
 * @param func Called for each element in `src`. Returns a pair `[<key>, <value>]`.
 * @returns A new object whoses keys and values are the result of
 * applying `func` to each element in `src`.
 */
export const mapArray = <SrcType, DestType>(
    src: Array<SrcType>,
    func: (srcValue: SrcType, index: number) => [string, DestType]
): { [key: string]: DestType } => {
    const dest: { [key: string]: DestType } = {}
    src.forEach((srcValue, i) => {
        const [key, destValue] = func(srcValue, i)
        dest[key] = destValue
    })
    return dest
}

/**
 * Renders one of several alternative bits of code.
 *
 * @param routes A list of alternatives `[<test>, <code>]`
 * @returns The first `code` whose `test` evaluated to true.
 */
export const renderSwitch = (
    ...routes: Array<[boolean, Code | Array<Code>]>
) => {
    const route = routes.find(([test]) => test)
    if (!route) {
        throw new Error(`no route found`)
    }
    return route[1]
}

/** Renders `code` only if `test` is truthy. */
export const renderIf = (test: any, code: Code | (() => Code)) => {
    if (!test) {
        return ''
    }
    if (typeof code === 'function') {
        return code()
    } else {
        return code
    }
}
