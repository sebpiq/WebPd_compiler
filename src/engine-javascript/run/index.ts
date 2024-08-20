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

/**
 * These bindings enable easier interaction with modules generated with our JavaScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import { proxyAsModuleWithBindings } from '../../run/run-helpers'
import { Bindings } from '../../run/types'
import { Code } from '../../ast/types'
import { Engine } from '../../run/types'
import {
    createFsModule,
    FsRawModule,
} from '../../stdlib/fs/bindings-javascript'
import {
    CommonsRawModule,
    createCommonsModule,
} from '../../stdlib/commons/bindings-javascript'
import { proxyWithEngineNameMapping } from '../../run/run-helpers'

export interface EngineLifecycleRawModule {
    metadata: Engine['metadata']
    initialize: Engine['initialize']
    dspLoop: Engine['dspLoop']
    io: Engine['io']
}

export type RawJavaScriptEngine = CommonsRawModule &
    FsRawModule &
    EngineLifecycleRawModule

export const compileRawModule = (code: Code): EngineLifecycleRawModule =>
    new Function(`
        ${code}
        return exports
    `)()

export const createEngineBindings = (
    rawModule: RawJavaScriptEngine
): Bindings<Engine> => {
    const exportedNames =
        rawModule.metadata!.compilation.variableNamesIndex.globals
    const globalsBindings: Bindings<Engine['globals']> = {
        commons: {
            type: 'proxy',
            value: createCommonsModule(rawModule, rawModule.metadata),
        },
    }

    if ('fs' in exportedNames) {
        globalsBindings.fs = { type: 'proxy', value: createFsModule(rawModule) }
    }

    return {
        metadata: { type: 'raw' },
        initialize: { type: 'raw' },
        dspLoop: { type: 'raw' },
        io: { type: 'raw' },
        globals: {
            type: 'proxy',
            value: proxyAsModuleWithBindings(rawModule, globalsBindings),
        },
    }
}

export const createEngine = <AdditionalExports>(
    code: Code,
    additionalBindings?: Bindings<AdditionalExports>
): Engine => {
    const rawModule = compileRawModule(code)
    const rawModuleWithNameMapping = proxyWithEngineNameMapping(
        rawModule,
        rawModule.metadata.compilation.variableNamesIndex
    )
    return proxyAsModuleWithBindings(rawModule, {
        ...createEngineBindings(rawModuleWithNameMapping),
        ...(additionalBindings || {}),
    })
}
