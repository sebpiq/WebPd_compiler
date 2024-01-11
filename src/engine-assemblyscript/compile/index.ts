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
import { AssemblyScriptWasmEngineCode } from './types'
import render from '../../ast/render'
import macros from './macros'
import { ast } from '../../ast/declare'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const {
        settings: { audio: audioSettings, io },
        variableNamesIndex,
        precompilation,
    } = compilation
    const { channelCount } = audioSettings
    const globs = compilation.variableNamesIndex.globs
    const metadata = buildMetadata(compilation)

    // prettier-ignore
    return render(macros, ast`
        const metadata: string = '${JSON.stringify(metadata)}'
        
        ${generateGlobs(compilation)}
        let ${globs.input}: FloatArray = createFloatArray(0)
        let ${globs.output}: FloatArray = createFloatArray(0)

        ${precompilation.dependencies.ast}

        ${generateEmbeddedArrays(compilation)}

        ${generateNodeStateDeclarations(compilation)}
        ${generatePortletsDeclarations(compilation)}

        ${generateIoMessageReceivers(compilation)}
        ${generateIoMessageSenders(compilation, (variableName) => 
            ast`export declare function ${variableName}(m: Message): void`)}

        ${generateNodeInitializations(compilation)}

        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.input} = createFloatArray(blockSize * ${channelCount.in.toString()})
            ${globs.output} = createFloatArray(blockSize * ${channelCount.out.toString()})
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            _commons_emitEngineConfigure()
        }

        export function getInput(): FloatArray { return ${globs.input} }

        export function getOutput(): FloatArray { return ${globs.output} }

        export function loop(): void {
            ${generateLoop(compilation)}
        }

        export {
            metadata,
            ${Object.entries(io.messageReceivers).map(([nodeId, spec]) => 
                spec.portletIds.map(inletId => 
                    variableNamesIndex.io.messageReceivers[nodeId][inletId] + ','
                )
            )}
        }

        ${generateImportsExports(
            compilation,
            ({ name, args, returnType }) => ast`export declare function ${name} (${
                args.map((a) => `${a.name}: ${a.type}`).join(',')
            }): ${returnType}`, 
            ({ name }) => ast`export { ${name} }`
        )}
    `)
}
