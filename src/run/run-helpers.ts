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

import { AudioSettings } from '../compile/types'
import { Bindings } from './types'

// NOTE : not necessarily the most logical place to put this function, but we need it here
// cause it's imported by the bindings.
export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array

/** Helper to create a Module by wrapping a RawModule with Bindings */
export const createModule = <ModuleType extends { [key: string]: any }>(
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