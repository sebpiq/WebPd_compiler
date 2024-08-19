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

import { EngineContext } from '../../engine-assemblyscript/run/types'
import {
    CoreRawModuleWithDependencies,
    lowerFloatArray,
    lowerString,
    readTypedArray,
} from '../core/bindings-assemblyscript'
import { FloatArray } from '../../run/types'
import { Bindings } from '../../run/types'
import {
    EngineLifecycleRawModuleWithDependencies,
    updateWasmInOuts,
} from '../../engine-assemblyscript/run/engine-lifecycle-bindings'
import { CommonsApi, CommonsExportsAssemblyScript } from './types'

export interface CommonsRawModule {
    globals: {
        commons: CommonsExportsAssemblyScript
    }
}

type CommonsRawModuleWithDependencies = CommonsRawModule &
    CoreRawModuleWithDependencies &
    EngineLifecycleRawModuleWithDependencies

export const createCommonsBindings = (
    engineContext: EngineContext<CommonsRawModuleWithDependencies>
): Bindings<CommonsApi> => {
    const { refs, cache } = engineContext
    return {
        getArray: {
            type: 'proxy',
            value: (arrayName) => {
                const arrayNamePointer = lowerString(refs.rawModule!, arrayName)
                const arrayPointer =
                    refs.rawModule!.globals.commons.getArray(arrayNamePointer)
                return readTypedArray(
                    refs.rawModule!,
                    cache.arrayType,
                    arrayPointer
                ) as FloatArray
            },
        },
        setArray: {
            type: 'proxy',
            value: (arrayName, array) => {
                const stringPointer = lowerString(refs.rawModule!, arrayName)
                const { arrayPointer } = lowerFloatArray(
                    refs.rawModule!,
                    cache.bitDepth,
                    array
                )
                refs.rawModule!.globals.commons.setArray(
                    stringPointer,
                    arrayPointer
                )
                updateWasmInOuts(engineContext)
            },
        },
    }
}
