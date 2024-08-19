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
import { EngineLifecycleRawModule } from '../../engine-javascript/run'
import {
    getFloatArrayType,
    proxyAsModuleWithBindings,
} from '../../run/run-helpers'
import { EngineMetadata, Engine, FloatArray } from '../../run/types'
import { CommonsApi, CommonsExportsJavaScript } from './types'

export interface CommonsRawModule extends EngineLifecycleRawModule {
    globals: {
        commons: CommonsExportsJavaScript
    }
}

export const createCommonsModule = (
    rawModule: CommonsRawModule,
    metadata: EngineMetadata
): CommonsApi => {
    const floatArrayType = getFloatArrayType(metadata.settings.audio.bitDepth)
    return proxyAsModuleWithBindings<Engine['globals']['commons']>(rawModule, {
        getArray: {
            type: 'proxy',
            value: (arrayName) => rawModule.globals.commons.getArray(arrayName),
        },
        setArray: {
            type: 'proxy',
            value: (arrayName: string, array: FloatArray | Array<number>) =>
                rawModule.globals.commons.setArray(
                    arrayName,
                    new floatArrayType(array)
                ),
        },
    })
}
