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

import { Code } from './ast/types'

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
    src: ReadonlyArray<SrcType>,
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
    const matchedRoute = routes.find(([test]) => test)
    if (!matchedRoute) {
        throw new Error(`no route found`)
    }
    return matchedRoute[1]
}
