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
import generateDeclarationsGlobals from '../../compile/generate-declarations-globals'
import generateDeclarationsNode from '../../compile/generate-declarations-nodes'
import generateLoop from '../../compile/generate-loop'
import generateDeclarationsDependencies from '../../compile/generate-declarations-dependencies'
import generateInitializationsNodes from '../../compile/generate-initializations-nodes'
import { Compilation } from '../../compile/types'
import { JavaScriptEngineCode } from './types'
import generateInletCallers from '../../compile/generate-inlet-callers'
import generateOutletListeners from '../../compile/generate-outlet-listeners'
import generateEmbeddedArrays from '../../compile/generate-embedded-arrays'
import generateImportsExports from '../../compile/generate-imps-exps'
import render from '../../ast/render'
import macros from './macros'
import { ast } from '../../ast/declare'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        variableNamesIndex,
        outletListenerSpecs,
        inletCallerSpecs,
        engineDependencies,
    } = compilation
    const globs = compilation.variableNamesIndex.globs
    const metadata = buildMetadata(compilation)

    // prettier-ignore
    return render(macros, ast`
        ${generateDeclarationsGlobals(compilation)}
        ${generateDeclarationsDependencies(compilation, engineDependencies)}
        ${generateDeclarationsNode(compilation)}

        ${generateEmbeddedArrays(compilation)}

        ${generateInletCallers(compilation)}
        ${generateOutletListeners(compilation, (
            variableName, 
            nodeId, 
            outletId
        ) => ast`const ${variableName} = (m) => {exports.outletListeners['${nodeId}']['${outletId}'].onMessage(m)}`)}

        ${generateInitializationsNodes(compilation)}

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
            outletListeners: {
                ${Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
                    ast`${nodeId}: {
                        ${outletIds.map(outletId => 
                            `"${outletId}": {onMessage: () => undefined},`)}
                    },`
                )}
            },
            inletCallers: {
                ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
                    ast`${nodeId}: {
                        ${inletIds.map(inletId => 
                            `"${inletId}": ${variableNamesIndex.inletCallers[nodeId][inletId]},`)}
                    },`
                )}
            },
        }

        ${generateImportsExports(
            'javascript',
            engineDependencies,
            ({ name }) => ast`
                exports.${name} = () => { throw new Error('import for ${name} not provided') }
                const ${name} = (...args) => exports.${name}(...args)
            `, 
            ({ name }) => ast`exports.${name} = ${name}`
        )}
    `)
}
