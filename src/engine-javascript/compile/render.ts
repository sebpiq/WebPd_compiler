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
import { JavaScriptEngineCode } from './types'
import render from '../../compile/render'
import macros from './macros'
import { ast } from '../../ast/declare'
import { RenderInput } from '../../compile/render/types'
import { ReadOnlyIndex } from '../../compile/proxies'

export default (renderInput: RenderInput): JavaScriptEngineCode => {
    const {
        precompiledCode,
        settings,
        variableNamesReadOnly: variableNamesIndex,
    } = renderInput
    const variableNamesReadOnly = ReadOnlyIndex(variableNamesIndex)
    const { globals } = variableNamesReadOnly
    const renderTemplateInput = {
        settings,
        globals,
        precompiledCode,
    }
    const metadata = buildMetadata(renderInput)

    // prettier-ignore
    return render(macros, ast`
        ${templates.dependencies(renderTemplateInput)}
        ${templates.nodeImplementationsCoreAndStateClasses(renderTemplateInput)}

        ${templates.nodeStateInstances(renderTemplateInput)}
        ${templates.portletsDeclarations(renderTemplateInput)}

        ${templates.coldDspFunctions(renderTemplateInput)}
        ${templates.ioMessageReceivers(renderTemplateInput)}
        ${templates.ioMessageSenders(renderTemplateInput, (
            variableName, 
            nodeId, 
            outletId
        ) => ast`const ${variableName} = (m) => {exports.io.messageSenders['${nodeId}']['${outletId}'](m)}`)}

        const exports = {
            metadata: ${JSON.stringify(metadata)},
            initialize: (sampleRate, blockSize) => {
                exports.metadata.settings.audio.sampleRate = sampleRate
                exports.metadata.settings.audio.blockSize = blockSize
                ${globals.core!.SAMPLE_RATE!} = sampleRate
                ${globals.core!.BLOCK_SIZE!} = blockSize

                ${templates.nodeInitializations(renderTemplateInput)}
                ${templates.coldDspInitialization(renderTemplateInput)}
            },
            dspLoop: (${globals.core!.INPUT!}, ${globals.core!.OUTPUT!}) => {
                ${templates.dspLoop(renderTemplateInput)}
            },
            io: {
                messageReceivers: {
                    ${Object.entries(precompiledCode.io.messageReceivers).map(([nodeId, portletIdsMap]) => 
                        ast`${nodeId}: {
                            ${Object.entries(portletIdsMap).map(([inletId, { functionName }]) => 
                                `"${inletId}": ${functionName},`)}
                        },`
                    )}
                },
                messageSenders: {
                    ${Object.entries(settings.io.messageSenders).map(([nodeId, spec]) =>
                        ast`${nodeId}: {
                            ${spec.portletIds.map(outletId => 
                                `"${outletId}": () => undefined,`)}
                        },`
                    )}
                },
            }
        }

        ${templates.importsExports(
            renderTemplateInput,
            ({ name }) => ast`
                exports.${name} = () => { throw new Error('import for ${name} not provided') }
                const ${name} = (...args) => exports.${name}(...args)
            `, 
            (name) => ast`exports.${name} = ${name}`
        )}
    `)
}
