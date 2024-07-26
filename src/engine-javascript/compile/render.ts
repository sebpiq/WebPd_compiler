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

export default (
    renderInput: RenderInput,
): JavaScriptEngineCode => {
    const { precompiledCode, settings, variableNamesIndex } = renderInput
    const { globs, globalCode } = variableNamesIndex
    const renderTemplateInput = {
        settings,
        globs,
        globalCode,
        precompiledCode,
    }
    const metadata = buildMetadata(renderInput)

    // prettier-ignore
    return render(macros, ast`
        ${templates.dependencies(renderTemplateInput)}
        ${templates.nodeImplementationsCoreAndStateClasses(renderTemplateInput)}

        ${templates.globs(renderTemplateInput)}

        ${templates.embeddedArrays(renderTemplateInput)}

        ${templates.nodeStateInstances(renderTemplateInput)}
        ${templates.portletsDeclarations(renderTemplateInput)}

        ${templates.coldDspFunctions(renderTemplateInput)}
        ${templates.ioMessageReceivers(renderTemplateInput)}
        ${templates.ioMessageSenders(renderTemplateInput, (
            variableName, 
            nodeId, 
            outletId
        ) => ast`const ${variableName} = (m) => {exports.io.messageSenders['${nodeId}']['${outletId}'].onMessage(m)}`)}

        const exports = {
            metadata: ${JSON.stringify(metadata)},
            initialize: (sampleRate, blockSize) => {
                exports.metadata.audioSettings.sampleRate = sampleRate
                exports.metadata.audioSettings.blockSize = blockSize
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize

                ${templates.nodeInitializations(renderTemplateInput)}
                ${templates.coldDspInitialization(renderTemplateInput)}
            },
            dspLoop: (${globs.input}, ${globs.output}) => {
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
                                `"${outletId}": {onMessage: () => undefined},`)}
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
