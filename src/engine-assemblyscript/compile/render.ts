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

import { buildMetadata, renderMetadata } from '../../compile/render/metadata'
import templates from '../../compile/render/templates'
import { AssemblyScriptWasmEngineCode } from './types'
import render from '../../compile/render'
import macros from './macros'
import { ast } from '../../ast/declare'
import { RenderInput } from '../../compile/render/types'

export default (renderInput: RenderInput): AssemblyScriptWasmEngineCode => {
    const {
        precompiledCode,
        settings,
        variableNamesReadOnly: variableNamesIndex,
    } = renderInput
    const globals = variableNamesIndex.globals
    const renderTemplateInput = {
        settings,
        globals,
        precompiledCode,
    }
    const { channelCount } = settings.audio
    const metadata = buildMetadata(renderInput)

    // prettier-ignore
    return render(macros, ast`
        const metadata: string = '${renderMetadata(metadata)}'

        ${templates.dependencies(renderTemplateInput)}
        ${templates.nodeImplementationsCoreAndStateClasses(renderTemplateInput)}

        ${templates.nodeStateInstances(renderTemplateInput)}
        ${templates.portletsDeclarations(renderTemplateInput)}

        ${templates.coldDspFunctions(renderTemplateInput)}
        ${templates.ioMessageReceivers(renderTemplateInput)}
        ${templates.ioMessageSenders(renderTemplateInput, (variableName) => 
            ast`export declare function ${variableName}(m: ${globals.msg!.Message!}): void`)}

        export function initialize(sampleRate: Float, blockSize: Int): void {
            ${globals.core!.INPUT!} = createFloatArray(blockSize * ${channelCount.in.toString()})
            ${globals.core!.OUTPUT!} = createFloatArray(blockSize * ${channelCount.out.toString()})
            ${globals.core!.SAMPLE_RATE!} = sampleRate
            ${globals.core!.BLOCK_SIZE!} = blockSize

            ${templates.nodeInitializations(renderTemplateInput)}
            ${templates.coldDspInitialization(renderTemplateInput)}
        }

        export function dspLoop(): void {
            ${templates.dspLoop(renderTemplateInput)}
        }

        export {
            metadata,
            ${Object.values(precompiledCode.io.messageReceivers).map((portletIdsMap) => 
                Object.values(portletIdsMap).map(({ functionName }) => 
                    functionName + ','
                )
            )}
        }

        ${templates.importsExports(
            renderTemplateInput,
            ({ name, args, returnType }) => ast`export declare function ${name} (${
                args.map((a) => `${a.name}: ${a.type}`).join(',')
            }): ${returnType}`, 
            (name) => ast`export { ${name} }`
        )}
    `)
}
