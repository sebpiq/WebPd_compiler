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

import { buildMetadata, getSharedCodeGeneratorContext } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileLoop from '../engine-common/compile-loop'
import { renderCode } from '../functional-helpers'
import { Compilation } from '../types'
import { generateCoreCode } from '../core-code'
import { AssemblyScriptWasmEngineCode } from './types'
import {
    compileOutletListeners,
    compileInletCallers,
} from '../engine-common/compile-portlet-accessors'
import embedArrays from '../engine-common/embed-arrays'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const { audioSettings, inletCallerSpecs, codeVariableNames } = compilation
    const { channelCount } = audioSettings
    const globs = compilation.codeVariableNames.globs
    const metadata = buildMetadata(compilation)

    // prettier-ignore
    return renderCode`
        ${generateCoreCode(getSharedCodeGeneratorContext(compilation))}

        ${embedArrays(compilation)}

        ${compileDeclare(compilation)}

        ${compileInletCallers(compilation)}
        
        ${compileOutletListeners(compilation, (variableName) => `
            export declare function ${variableName}(m: Message): void
        `)}

        const metadata: string = '${JSON.stringify(metadata)}'
        let ${globs.input}: FloatArray = createFloatArray(0)
        let ${globs.output}: FloatArray = createFloatArray(0)
        
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
            ${compileLoop(compilation)}
        }

        // FS IMPORTS
        export declare function i_fs_readSoundFile (id: fs_OperationId, url: Url, info: Message): void
        export declare function i_fs_writeSoundFile (id: fs_OperationId, sound: FloatArray[], url: Url, info: Message): void
        export declare function i_fs_openSoundReadStream (id: fs_OperationId, url: Url, info: Message): void
        export declare function i_fs_openSoundWriteStream (id: fs_OperationId, url: Url, info: Message): void
        export declare function i_fs_sendSoundStreamData (id: fs_OperationId, block: FloatArray[]): void
        export declare function i_fs_closeSoundStream (id: fs_OperationId, status: fs_OperationStatus): void

        export {
            metadata,

            // FS EXPORTS
            x_fs_onReadSoundFileResponse as fs_onReadSoundFileResponse,
            x_fs_onWriteSoundFileResponse as fs_onWriteSoundFileResponse,
            x_fs_onSoundStreamData as fs_onSoundStreamData,
            x_fs_onCloseSoundStream as fs_onCloseSoundStream,

            // MSG EXPORTS
            x_msg_create as msg_create,
            x_msg_getTokenTypes as msg_getTokenTypes,
            x_msg_createTemplate as msg_createTemplate,
            msg_writeStringToken,
            msg_writeFloatToken,
            msg_readStringToken,
            msg_readFloatToken,
            MSG_FLOAT_TOKEN,
            MSG_STRING_TOKEN,

            // COMMONS EXPORTS
            commons_setArray,
            commons_getArray, 

            // CORE EXPORTS
            createFloatArray,
            x_core_createListOfArrays as core_createListOfArrays,
            x_core_pushToListOfArrays as core_pushToListOfArrays,
            x_core_getListOfArraysLength as core_getListOfArraysLength,
            x_core_getListOfArraysElem as core_getListOfArraysElem,

            // INLET CALLERS
            ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) => 
                inletIds.map(inletId => 
                    codeVariableNames.inletCallers[nodeId][inletId] + ','
                )
            )}
        }
    `
}
