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
    generateNodeInitializations,
    generateLoop,
    generateIoMessageReceivers,
    generateIoMessageSenders,
    generateEmbeddedArrays,
    generateImportsExports,
    generateNodeStateDeclarations,
} from '../../compile/generate'
import { Compilation } from '../../compile/types'
import { JavaScriptEngineCode } from './types'
import render from '../../ast/render'
import macros from './macros'
import { ast } from '../../ast/declare'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        variableNamesIndex,
        settings: { io },
        precompilation,
    } = compilation
    const globs = compilation.variableNamesIndex.globs
    const metadata = buildMetadata(compilation)

    // prettier-ignore
    return render(macros, ast`
        ${generateGlobs(compilation)}

        ${precompilation.dependencies.ast}

        ${generateEmbeddedArrays(compilation)}

        ${generateNodeStateDeclarations(compilation)}
        ${generatePortletsDeclarations(compilation)}

        ${generateIoMessageReceivers(compilation)}
        ${generateIoMessageSenders(compilation, (
            variableName, 
            nodeId, 
            outletId
        ) => ast`const ${variableName} = (m) => {exports.io.messageSenders['${nodeId}']['${outletId}'].onMessage(m)}`)}

        ${generateNodeInitializations(compilation)}

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
                ${generateLoop(compilation)}
            },
            io: {
                messageReceivers: {
                    ${Object.entries(io.messageReceivers).map(([nodeId, spec]) =>
                        ast`${nodeId}: {
                            ${spec.portletIds.map(inletId => 
                                `"${inletId}": ${variableNamesIndex.io.messageReceivers[nodeId][inletId]},`)}
                        },`
                    )}
                },
                messageSenders: {
                    ${Object.entries(io.messageSenders).map(([nodeId, spec]) =>
                        ast`${nodeId}: {
                            ${spec.portletIds.map(outletId => 
                                `"${outletId}": {onMessage: () => undefined},`)}
                        },`
                    )}
                },
            }
        }

        ${generateImportsExports(
            compilation,
            ({ name }) => ast`
                exports.${name} = () => { throw new Error('import for ${name} not provided') }
                const ${name} = (...args) => exports.${name}(...args)
            `, 
            ({ name }) => ast`exports.${name} = ${name}`
        )}
    `)
}
