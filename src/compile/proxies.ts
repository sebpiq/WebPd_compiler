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

interface ProxyPath {
    keys: Array<string>
    parents: Array<any>
}

const _addPath = (parent: any, key: string, _path?: ProxyPath) => {
    const path = _ensurePath(_path)
    return {
        keys: [...path.keys, key],
        parents: [...path.parents, parent],
    }
}

const _ensurePath = (path?: ProxyPath) =>
    path || {
        keys: [],
        parents: [],
    }

const _proxySetHandlerReadOnly = () => {
    throw new Error('This Proxy is read-only.')
}

const _proxyGetHandlerThrowIfKeyUnknown = <T extends Object, K extends string>(
    target: T,
    key: K,
    path?: ProxyPath
): boolean => {
    if (!target.hasOwnProperty(key as PropertyKey)) {
        // Whitelist some fields that are undefined but accessed at
        // some point or another by our code.
        // TODO : find a better way to do this.
        if (
            [
                'toJSON',
                'Symbol(Symbol.toStringTag)',
                'constructor',
                '$typeof',
                '$$typeof',
                '@@__IMMUTABLE_ITERABLE__@@',
                '@@__IMMUTABLE_RECORD__@@',
            ].includes(key)
        ) {
            return true
        }
        throw new Error(
            `namespace${
                path ? ` <${path.keys.join('.')}>` : ''
            } doesn't know key "${String(key)}"`
        )
    }
    return false
}

// ---------------------------- Assigner ---------------------------- //
type _AssignerSpecIndex<T, C> = {
    Index: (k: string, context: C, path: ProxyPath) => AssignerSpec<T[keyof T], C>
    indexConstructor: (context: C, path: ProxyPath) => T
}
// TODO : seems to validate pretty much any type. Make more restrictive
// e.g. : add Interface({a:  before any assigner and it seems sill valid.
type _AssignerSpecInterface<T, C> = {
    Interface: { [K in keyof T]: AssignerSpec<T[K], C> }
}
type _AssignerSpecLiteral<T, C> = { Literal: (context: C, path: ProxyPath) => T }
type _AssignerSpecLiteralDefaultNull<T, C> = { LiteralDefaultNull: (context: C, path: ProxyPath) => T }

export type AssignerSpec<T, C=typeof undefined> =
    | _AssignerSpecInterface<T, C>
    | _AssignerSpecIndex<T, C>
    | _AssignerSpecLiteral<T, C>
    | _AssignerSpecLiteralDefaultNull<T, C>

export const Assigner = <T extends { [k: string]: any }, C=typeof undefined>(
    spec: AssignerSpec<T, C>,
    _obj: Partial<T> | undefined,
    context: C,
    _path?: ProxyPath
): T => {
    const path = _path || { keys: [], parents: [] }
    const obj: T = Assigner.ensureValue(_obj, spec, context, path)

    // If `_path` is provided, assign the new value to the parent object.
    if (_path) {
        const parent = _path.parents[_path.parents.length - 1]!
        const key = _path.keys[_path.keys.length - 1]!
        // The only case where we want to overwrite the existing value
        // is when it was a `null` assigned by `LiteralDefaultNull`, and
        // we want to set the real value instead.
        if (!(key in parent) || 'LiteralDefaultNull' in spec) {
            parent[key] = obj
        }
    }

    // If the object is a Literal, end of the recursion.
    if ('Literal' in spec || 'LiteralDefaultNull' in spec) {
        return obj
    }

    return new Proxy<T>(obj, {
        get: (_, k) => {
            const key = String(k) as keyof T
            let nextSpec: AssignerSpec<T[keyof T], C>
            if ('Index' in spec) {
                nextSpec = spec.Index(key as string, context, path)
            } else if ('Interface' in spec) {
                if (!(key in spec.Interface)) {
                    throw new Error(`Interface has no entry "${String(key)}"`)
                }
                nextSpec = spec.Interface[key]
            } else {
                throw new Error('no builder')
            }

            return Assigner(
                nextSpec,
                // We use this form here instead of `obj[key]` specifically
                // to allow Assign to play well with `ProtectedIndex`, which
                // would raise an error if trying to access an undefined key.
                key in obj ? obj[key] : undefined,
                context,
                _addPath(obj, key as string, path)
            )
        },

        set: _proxySetHandlerReadOnly,
    })
}

Assigner.ensureValue = <T, C=typeof undefined>(
    _obj: Partial<T> | undefined,
    spec: AssignerSpec<T, C>,
    context: C,
    _path?: ProxyPath,
    _recursionPath?: ProxyPath,
): T => {
    if ('Index' in spec) {
        return (_obj || spec.indexConstructor(context, _ensurePath(_path))) as T
    } else if ('Interface' in spec) {
        const obj = (_obj || {}) as T
        Object.entries(spec.Interface).forEach(([key, nextSpec]) => {
            obj[key as keyof T] = Assigner.ensureValue<T[keyof T], C>(
                (obj as any)[key],
                nextSpec as any,
                context,
                _addPath(obj, key, _path),
                _addPath(obj, key, _recursionPath),
            )
        })
        return obj
    } else if ('Literal' in spec) {
        return (_obj || spec.Literal(context, _ensurePath(_path))) as T
    } else if ('LiteralDefaultNull' in spec) {
        if (!_recursionPath) {
            return (_obj || spec.LiteralDefaultNull(context, _ensurePath(_path))) as T
        } else {
            return (_obj || null) as T
        }
    } else {
        throw new Error('Invalid Assigner')
    }
}

Assigner.Interface = <T, C>(a: {
    [K in keyof T]: AssignerSpec<T[K], C>
}): _AssignerSpecInterface<T, C> => ({ Interface: a })

Assigner.Index = <T, C>(
    f: (k: string, context: C) => AssignerSpec<T[keyof T], C>,
    indexConstructor?: (context: C, path: ProxyPath) => any
): _AssignerSpecIndex<T, C> => ({
    Index: f,
    indexConstructor: indexConstructor || (() => ({} as T)),
})

Assigner.Literal = <T, C>(f: (context: C, path: ProxyPath) => T): _AssignerSpecLiteral<T, C> => ({
    Literal: f,
})

Assigner.LiteralDefaultNull = <T, C>(
    f: (context: C, path: ProxyPath) => T
): _AssignerSpecLiteralDefaultNull<T | null, C> => ({ LiteralDefaultNull: f })

// ---------------------------- ProtectedIndex ---------------------------- //
/**
 * Helper to declare namespace objects enforcing stricter access rules. 
 * Specifically, it forbids :
 * - reading an unknown property.
 * - trying to overwrite an existing property.
 */
export const ProtectedIndex = <T extends Object>(
    namespace: T,
    path?: ProxyPath
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = String(k)
            if (_proxyGetHandlerThrowIfKeyUnknown(target, key, path)) {
                return undefined
            }
            return (target as any)[key]
        },

        set: (target, k, newValue) => {
            const key = _trimDollarKey(String(k)) as keyof T
            if (target.hasOwnProperty(key)) {
                throw new Error(
                    `Key "${String(
                        key
                    )}" is protected and cannot be overwritten.`
                )
            } else {
                target[key] = newValue
            }
            return newValue
        },
    })
}

// ---------------------------- ReadOnlyIndex ---------------------------- //
/**
 * Helper to declare namespace objects enforcing stricter access rules. 
 * Specifically, it forbids :
 * - reading an unknown property.
 * - writing to a property.
 */
export const ReadOnlyIndex = <T extends Object>(
    namespace: T,
    path?: ProxyPath
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = String(k)
            if (_proxyGetHandlerThrowIfKeyUnknown(target, key, path)) {
                return undefined
            }
            return (target as any)[key]
        },

        set: _proxySetHandlerReadOnly,
    })
}

// ---------------------------- ReadOnlyIndexWithDollarKeys ---------------------------- //
/**
 * Helper to declare namespace objects enforcing stricter access rules. 
 * Specifically :
 * - it is read only
 * - it throws an error when trying to read an unknown property.
 * - allows to access properties starting with a number by prepending a `$`.
 *      This is convenient to access portlets by their id without using 
 *      indexing syntax, for example : `namespace.$0` instead of `namespace['0']`.
 */
export const ReadOnlyIndexWithDollarKeys = <T extends Object>(
    namespace: T,
    nodeId: DspGraph.NodeId,
    name: string
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = _trimDollarKey(String(k))
            if (
                _proxyGetHandlerThrowIfKeyUnknown(target, key, {
                    parents: [target],
                    keys: [nodeId, name],
                })
            ) {
                return undefined
            }
            return (target as any)[key]
        },

        set: _proxySetHandlerReadOnly,
    })
}

const _trimDollarKey = (key: string) => {
    const match = /\$(.*)/.exec(key)
    if (!match) {
        return key
    } else {
        return match[1]!
    }
}
