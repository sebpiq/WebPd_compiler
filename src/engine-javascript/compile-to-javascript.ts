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

import { buildMetadata, getFloatArrayType, getGlobalCodeGeneratorContext } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileLoop from '../engine-common/compile-loop'
import compileGlobalCode from '../engine-common/compile-global-code'
import { Compilation } from '../types'
import { JavaScriptEngineCode } from './types'
import { generateCoreCode } from '../core-code'
import { renderCode } from '../functional-helpers'
import {
    compileOutletListeners,
    compileInletCallers,
} from '../engine-common/compile-portlet-accessors'
import embedArrays from '../engine-common/embed-arrays'
import { fsCore, fsReadSoundFile, fsReadSoundStream, fsSoundStreamCore, fsWriteSoundFile, fsWriteSoundStream } from '../core-code/fs'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        codeVariableNames,
        outletListenerSpecs,
        inletCallerSpecs,
        audioSettings,
    } = compilation
    const globs = compilation.codeVariableNames.globs
    const metadata = buildMetadata(compilation)
    const sharedCodeContext = getGlobalCodeGeneratorContext(compilation)

    // When setting an array we need to make sure it is converted to the right type.
    const floatArrayType = getFloatArrayType(audioSettings.bitDepth)

    // prettier-ignore
    return renderCode`
        ${generateCoreCode(sharedCodeContext)}

        ${embedArrays(compilation)}

        ${compileDeclare(compilation)}

        ${compileInletCallers(compilation)}

        ${compileOutletListeners(compilation, (
            variableName, 
            nodeId, 
            outletId
        ) => `
            const ${variableName} = (m) => {
                exports.outletListeners['${nodeId}']['${outletId}'].onMessage(m)
            }
        `)}

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
                ${compileLoop(compilation)}
            },
            commons: {
                getArray: commons_getArray,
                setArray: (arrayName, array) => commons_setArray(arrayName, new ${floatArrayType.name}(array)),
            },
            outletListeners: {
                ${Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
                    renderCode`${nodeId}: {
                        ${outletIds.map(outletId => 
                            `"${outletId}": {onMessage: () => undefined},`)}
                    },`
                )}
            },
            inletCallers: {
                ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
                    renderCode`${nodeId}: {

                        ${inletIds.map(inletId => 
                            `"${inletId}": ${codeVariableNames.inletCallers[nodeId][inletId]},`)}
                    },`
                )}
            },
            fs: {
                onOpenSoundWriteStream: () => undefined,
                onSoundStreamData: () => undefined,
            },
        }

        ${compileGlobalCode(compilation, [ fsCore, fsReadSoundFile, fsWriteSoundFile, fsSoundStreamCore, fsReadSoundStream, fsWriteSoundStream ])}
    `
}
