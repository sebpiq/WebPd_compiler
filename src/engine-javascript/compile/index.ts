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

import { buildMetadata } from '../../compile/compile-helpers'
import {
    generatePortletsDeclarations,
    generateGlobs,
    generateNodeImplementationsCoreAndStateClasses,
    generateNodeInitializations,
    generateLoop,
    generateIoMessageReceivers,
    generateColdDspFunctions,
    generateIoMessageSenders,
    generateEmbeddedArrays,
    generateImportsExports,
    generateNodeStateInstances,
    generateColdDspInitialization,
} from '../../compile/generate'
import { Compilation } from '../../compile/types'
import { JavaScriptEngineCode } from './types'
import render from '../../ast/render'
import macros from './macros'
import { ast } from '../../ast/declare'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        settings,
        precompilation,
    } = compilation
    const variableNamesIndex = precompilation.variableNamesIndex
    const globs = variableNamesIndex.globs
    const metadata = buildMetadata(compilation)

    // prettier-ignore
    return render(macros, ast`
        ${precompilation.dependencies.ast}
        ${generateNodeImplementationsCoreAndStateClasses(precompilation)}

        ${generateGlobs(precompilation)}

        ${generateEmbeddedArrays(settings)}

        ${generateNodeStateInstances(precompilation)}
        ${generatePortletsDeclarations(precompilation, settings)}

        ${generateColdDspFunctions(precompilation)}
        ${generateIoMessageReceivers(precompilation, settings)}
        ${generateIoMessageSenders(precompilation, settings, (
            variableName, 
            nodeId, 
            outletId
        ) => ast`const ${variableName} = (m) => {exports.io.messageSenders['${nodeId}']['${outletId}'].onMessage(m)}`)}

        ${generateNodeInitializations(precompilation)}
        ${generateColdDspInitialization(precompilation)}

        const exports = {
            metadata: ${JSON.stringify(metadata)},
            configure: (sampleRate, blockSize) => {
                exports.metadata.audioSettings.sampleRate = sampleRate
                exports.metadata.audioSettings.blockSize = blockSize
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize
                _commons_emitEngineConfigure()
            },
            loop: (${globs.input}, ${globs.output}) => {
                ${generateLoop(precompilation)}
            },
            io: {
                messageReceivers: {
                    ${Object.entries(settings.io.messageReceivers).map(([nodeId, spec]) =>
                        ast`${nodeId}: {
                            ${spec.portletIds.map(inletId => 
                                `"${inletId}": ${variableNamesIndex.io.messageReceivers[nodeId][inletId]},`)}
                        },`
                    )}
                },
                messageSenders: {
                    ${Object.entries(settings.io.messageSenders).map(([nodeId, spec]) =>
                        ast`${nodeId}: {
                            ${spec.portletIds.map(outletId => 
                                `"${outletId}": {onMessage: () => undefined},`)}
                        },`
                    )}
                },
            }
        }

        ${generateImportsExports(
            precompilation,
            ({ name }) => ast`
                exports.${name} = () => { throw new Error('import for ${name} not provided') }
                const ${name} = (...args) => exports.${name}(...args)
            `, 
            ({ name }) => ast`exports.${name} = ${name}`
        )}
    `)
}
