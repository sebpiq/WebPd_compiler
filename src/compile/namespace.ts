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

import { DspGraph } from '../dsp-graph'

/**
 * Helper to declare namespace objects enforcing stricter access rules. Specifically, it forbids :
 * - reading an unknown property.
 * - trying to overwrite an existing property.
 *
 * Also allows to access properties starting with a number by prepending a `$`.
 * This is convenient to access portlets by their id without using indexing syntax, for example :
 * `namespace.$0` instead of `namespace['0']`.
 */
export const createNamespace = <T extends Object>(
    label: string,
    namespace: T
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = _trimDollarKey(String(k))
            if (!target.hasOwnProperty(key)) {
                // Whitelist some fields that are undefined but accessed at
                // some point or another by our code.
                // TODO : find a better way to do this.
                if (
                    [
                        'toJSON',
                        'Symbol(Symbol.toStringTag)',
                        'constructor',
                        '$$typeof',
                        '@@__IMMUTABLE_ITERABLE__@@',
                        '@@__IMMUTABLE_RECORD__@@',
                    ].includes(key)
                ) {
                    return undefined
                }
                throw new Error(
                    `Namespace "${label}" doesn't know key "${String(key)}"`
                )
            }
            return (target as any)[key]
        },

        set: (target, k, newValue) => {
            const key = _trimDollarKey(String(k)) as keyof T
            if (target.hasOwnProperty(key)) {
                throw new Error(
                    `Key "${String(key)}" is protected and cannot be overwritten.`
                )
            } else {
                target[key] = newValue
            }
            return newValue
        },
    })
}

export const nodeNamespaceLabel = (
    node: DspGraph.Node,
    namespaceName?: string
) => `${node.type}:${node.id}${namespaceName ? `:${namespaceName}` : ''}`

const _trimDollarKey = (key: string) => {
    const match = /\$(.*)/.exec(key)
    if (!match) {
        return key
    } else {
        return match[1]
    }
}