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
import { VariableNamesIndex } from '../compile/precompile/types'
import { CompilerTarget } from '../compile/types'
import { readMetadata as readMetadataWasm } from '../engine-assemblyscript/run/metadata'
import { JavaScriptEngineCode } from '../engine-javascript/compile/types'
import { createEngine } from '../engine-javascript/run'
import { RawModuleWithNameMapping } from './run-helpers'
import { EngineMetadata } from './types'

export const readMetadata = async (
    target: CompilerTarget,
    compiled: ArrayBuffer | JavaScriptEngineCode
): Promise<EngineMetadata> => {
    switch (target) {
        case 'assemblyscript':
            return readMetadataWasm(compiled as ArrayBuffer)
        case 'javascript':
            return createEngine(compiled as string).metadata
    }
}

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
export const applyEngineNameMapping = (
    rawModule: object,
    variableNamesIndex:
        | VariableNamesIndex
        | EngineMetadata['compilation']['variableNamesIndex']
) =>
    RawModuleWithNameMapping(rawModule, {
        globals: variableNamesIndex.globals,
        io: variableNamesIndex.io,
    })
