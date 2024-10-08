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

import { _proxyGetHandlerThrowIfKeyUnknown } from '../compile/proxies'
import { AudioSettings, VariableNamesIndex } from '../compile/types'
import { Bindings, EngineMetadata } from './types'

// NOTE : not necessarily the most logical place to put this function, but we need it here
// cause it's imported by the bindings.
export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array

export const proxyAsModuleWithBindings = <
    ModuleType extends { [key: string]: any }
>(
    rawModule: { [key: string]: any },
    bindings: Bindings<ModuleType>
): ModuleType =>
    // Use empty object on proxy cause proxy cannot redefine access of member of its target,
    // which causes issues for example for WebAssembly exports.
    // See : https://stackoverflow.com/questions/75148897/get-on-proxy-property-items-is-a-read-only-and-non-configurable-data-proper
    new Proxy(
        {},
        {
            get: (_, k) => {
                if (bindings.hasOwnProperty(k)) {
                    const key = String(k) as keyof ModuleType
                    const bindingSpec = bindings[key]
                    switch (bindingSpec.type) {
                        case 'raw':
                            // Cannot use hasOwnProperty here cause not defined in wasm exports object
                            if (k in rawModule) {
                                return (rawModule as any)[key]
                            } else {
                                throw new Error(
                                    `Key ${String(
                                        key
                                    )} doesn't exist in raw module`
                                )
                            }
                        case 'proxy':
                        case 'callback':
                            return bindingSpec.value
                    }

                    // We need to return undefined here for compatibility with various APIs
                    // which inspect object's attributes.
                } else {
                    return undefined
                }
            },
            has: function (_, k) {
                return k in bindings
            },
            set: (_, k, newValue) => {
                if (bindings.hasOwnProperty(String(k))) {
                    const key = String(k) as keyof ModuleType
                    const bindingSpec = bindings[key]
                    if (bindingSpec.type === 'callback') {
                        bindingSpec.value = newValue
                    } else {
                        throw new Error(
                            `Binding key ${String(key)} is read-only`
                        )
                    }
                } else {
                    throw new Error(
                        `Key ${String(k)} is not defined in bindings`
                    )
                }
                return true
            },
        }
    ) as ModuleType

/**
 * Reverse-maps exported variable names from `rawModule` according to the mapping defined
 * in `variableNamesIndex`.
 *
 * For example with :
 *
 * ```
 * const variableNamesIndex = {
 *     globals: {
 *         // ...
 *         fs: {
 *             // ...
 *             readFile: 'g_fs_readFile'
 *         },
 *     }
 * }
 * ```
 *
 * The function `g_fs_readFile` (if it is exported properly by the raw module), will then
 * be available on the returned object at path `.globals.fs.readFile`.
 */
export const proxyWithEngineNameMapping = (
    rawModule: object,
    variableNamesIndex:
        | VariableNamesIndex
        | EngineMetadata['compilation']['variableNamesIndex']
) =>
    proxyWithNameMapping(rawModule, {
        globals: variableNamesIndex.globals,
        io: variableNamesIndex.io,
    })

export const proxyWithNameMapping = (
    rawModule: object,
    variableNamesIndex: NameMapping
) => {
    if (typeof variableNamesIndex === 'string') {
        return (rawModule as any)[variableNamesIndex]
    } else if (typeof variableNamesIndex === 'object') {
        return new Proxy(rawModule, {
            get: (_, k): any => {
                const key = String(k)
                if (key in rawModule) {
                    return Reflect.get(rawModule, key)
                } else if (key in variableNamesIndex) {
                    const nextVariableNames =
                        variableNamesIndex[key as keyof NameMappingObject]!
                    return proxyWithNameMapping(rawModule, nextVariableNames)
                } else if (_proxyGetHandlerThrowIfKeyUnknown(rawModule, key)) {
                    return undefined
                }
            },
            has: function (_, k) {
                return k in rawModule || k in variableNamesIndex
            },
            set: (_, k, value) => {
                const key = String(k)
                if (key in variableNamesIndex) {
                    const variableName =
                        variableNamesIndex[key as keyof NameMappingObject]!
                    if (typeof variableName !== 'string') {
                        throw new Error(
                            `Failed to set value for key ${String(
                                k
                            )}: variable name is not a string`
                        )
                    }
                    return Reflect.set(rawModule, variableName, value)
                } else {
                    throw new Error(
                        `Key ${String(k)} is not defined in raw module`
                    )
                }
            },
        })
    } else {
        throw new Error(`Invalid name mapping`)
    }
}

type NameMappingObject = { [key: string]: string | NameMapping }
type NameMapping =  NameMappingObject | string | undefined
