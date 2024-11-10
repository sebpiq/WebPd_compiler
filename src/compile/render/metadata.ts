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
import packageInfo from '../../../package.json'
import { EngineMetadata } from '../../run/types'
import { VariableNamesIndex } from '../types'
import { RenderInput } from './types'

/** Helper to build engine metadata from compilation object */
export const buildMetadata = ({
    variableNamesReadOnly,
    precompiledCode: { dependencies },
    settings: { audio: audioSettings, io, customMetadata },
}: RenderInput): EngineMetadata => {
    const filteredGlobals: Partial<VariableNamesIndex['globals']> = {}
    const exportsAndImportsNames = [
        ...dependencies.exports,
        ...dependencies.imports.map((astFunc) => astFunc.name),
    ]
    Object.entries(variableNamesReadOnly.globals).forEach(([ns, names]) =>
        Object.entries(names || {}).forEach(([name, variableName]) => {
            if (exportsAndImportsNames.includes(variableName)) {
                if (!filteredGlobals[ns]) {
                    filteredGlobals[ns] = {}
                }
                filteredGlobals[ns]![name] = variableName
            }
        })
    )

    return {
        libVersion: packageInfo.version,
        customMetadata,
        settings: {
            audio: {
                ...audioSettings,
                // Determined at initialize
                sampleRate: 0,
                blockSize: 0,
            },
            io,
        },
        compilation: {
            variableNamesIndex: {
                io: variableNamesReadOnly.io,
                globals: filteredGlobals as VariableNamesIndex['globals'],
            },
        },
    }
}
