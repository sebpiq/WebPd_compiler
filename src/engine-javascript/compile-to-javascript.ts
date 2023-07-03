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

import { buildMetadata, getFloatArrayType, getSharedCodeGeneratorContext } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileLoop from '../engine-common/compile-loop'
import { Compilation } from '../types'
import { JavaScriptEngineCode } from './types'
import { generateCoreCode } from '../core-code'
import { renderCode } from '../functional-helpers'
import {
    compileOutletListeners,
    compileInletCallers,
} from '../engine-common/compile-portlet-accessors'
import embedArrays from '../engine-common/embed-arrays'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        codeVariableNames,
        outletListenerSpecs,
        inletCallerSpecs,
        audioSettings,
    } = compilation
    const globs = compilation.codeVariableNames.globs
    const metadata = buildMetadata(compilation)

    // When setting an array we need to make sure it is converted to the right type.
    const floatArrayType = getFloatArrayType(audioSettings.bitDepth)

    // prettier-ignore
    return renderCode`
        ${generateCoreCode(getSharedCodeGeneratorContext(compilation))}

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
                onReadSoundFile: () => undefined,
                onWriteSoundFile: () => undefined,
                onOpenSoundReadStream: () => undefined,
                onOpenSoundWriteStream: () => undefined,
                onSoundStreamData: () => undefined,
                onCloseSoundStream: () => undefined,
                sendReadSoundFileResponse: x_fs_onReadSoundFileResponse,
                sendWriteSoundFileResponse: x_fs_onWriteSoundFileResponse,
                sendSoundStreamData: x_fs_onSoundStreamData,
                closeSoundStream: x_fs_onCloseSoundStream,
            },
        }

        // FS IMPORTS
        const i_fs_readSoundFile = (...args) => exports.fs.onReadSoundFile(...args)
        const i_fs_writeSoundFile = (...args) => exports.fs.onWriteSoundFile(...args)
        const i_fs_openSoundReadStream = (...args) => exports.fs.onOpenSoundReadStream(...args)
        const i_fs_openSoundWriteStream = (...args) => exports.fs.onOpenSoundWriteStream(...args)
        const i_fs_sendSoundStreamData = (...args) => exports.fs.onSoundStreamData(...args)
        const i_fs_closeSoundStream = (...args) => exports.fs.onCloseSoundStream(...args)
    `
}
