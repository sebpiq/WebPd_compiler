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

import { buildMetadata } from '../../compile/render/metadata'
import templates from '../../compile/render/templates'
import { AssemblyScriptWasmEngineCode } from './types'
import render from '../../compile/render'
import macros from './macros'
import { ast } from '../../ast/declare'
import { RenderInput } from '../../compile/render/types'

export default (
    renderInput: RenderInput,
): AssemblyScriptWasmEngineCode => {
    const { precompiledCode, settings } = renderInput
    const { channelCount } = settings.audio
    const variableNamesIndex = precompiledCode.variableNamesIndex
    const globs = variableNamesIndex.globs
    const metadata = buildMetadata(renderInput)

    // prettier-ignore
    return render(macros, ast`
        const metadata: string = '${JSON.stringify(metadata)}'

        ${templates.dependencies(renderInput)}
        ${templates.nodeImplementationsCoreAndStateClasses(renderInput)}

        ${templates.globs(renderInput)}
        let ${globs.input}: FloatArray = createFloatArray(0)
        let ${globs.output}: FloatArray = createFloatArray(0)

        ${templates.embeddedArrays(renderInput)}

        ${templates.nodeStateInstances(renderInput)}
        ${templates.portletsDeclarations(renderInput)}

        ${templates.coldDspFunctions(renderInput)}
        ${templates.ioMessageReceivers(renderInput)}
        ${templates.ioMessageSenders(renderInput, (variableName) => 
            ast`export declare function ${variableName}(m: Message): void`)}

        ${templates.nodeInitializations(renderInput)}
        ${templates.coldDspInitialization(renderInput)}

        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.input} = createFloatArray(blockSize * ${channelCount.in.toString()})
            ${globs.output} = createFloatArray(blockSize * ${channelCount.out.toString()})
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            _commons_emitEngineConfigure()
        }

        export function getInput(): FloatArray { return ${globs.input} }

        export function getOutput(): FloatArray { return ${globs.output} }

        export function dspLoop(): void {
            ${templates.dspLoop(renderInput)}
        }

        export {
            metadata,
            ${Object.entries(settings.io.messageReceivers).map(([nodeId, spec]) => 
                spec.portletIds.map(inletId => 
                    variableNamesIndex.io.messageReceivers[nodeId]![inletId]!.funcName + ','
                )
            )}
        }

        ${templates.importsExports(
            renderInput,
            ({ name, args, returnType }) => ast`export declare function ${name} (${
                args.map((a) => `${a.name}: ${a.type}`).join(',')
            }): ${returnType}`, 
            ({ name }) => ast`export { ${name} }`
        )}
    `)
}
