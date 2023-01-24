/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { graphTraversalForCompile } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import { compileEventConfigure } from '../engine-common/compile-events'
import compileLoop from '../engine-common/compile-loop'
import { renderCode } from '../functional-helpers'
import { Compilation, EngineMetadata } from '../types'
import generateCoreCodeAsc from './core-code'
import { AssemblyScriptWasmEngineCode } from './types'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const {
        audioSettings,
        inletCallerSpecs,
        outletListenerSpecs,
        codeVariableNames,
    } = compilation
    const { channelCount } = audioSettings
    const graphTraversal = graphTraversalForCompile(compilation.graph)
    const globs = compilation.codeVariableNames.globs
    const { FloatArray } = codeVariableNames.types
    const metadata: EngineMetadata = {
        audioSettings: {
            ...audioSettings,
            // Determined at configure
            sampleRate: 0,
            blockSize: 0,
        },
        compilation: {
            inletCallerSpecs,
            outletListenerSpecs,
            codeVariableNames,
        },
    }

    // prettier-ignore
    return renderCode`
        ${generateCoreCodeAsc(codeVariableNames)}

        ${compileDeclare(compilation, graphTraversal)}
        ${compileOutletListeners(compilation)}

        const metadata: string = '${JSON.stringify(metadata)}'
        let ${globs.input}: FloatArray = new ${FloatArray}(0)
        let ${globs.output}: FloatArray = new ${FloatArray}(0)
        
        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            ${globs.input} = new ${FloatArray}(${globs.blockSize} * ${channelCount.in.toString()})
            ${globs.output} = new ${FloatArray}(${globs.blockSize} * ${channelCount.out.toString()})
            ${compileEventConfigure(compilation, graphTraversal)}
        }

        export function getInput(): ${FloatArray} { return ${globs.input} }

        export function getOutput(): ${FloatArray} { return ${globs.output} }

        export function loop(): void {
            ${compileLoop(compilation, graphTraversal)}
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

            // FARRAY EXPORTS
            x_farray_createListOfArrays as farray_createListOfArrays,
            x_farray_pushToListOfArrays as farray_pushToListOfArrays,
            x_farray_getListOfArraysLength as farray_getListOfArraysLength,
            x_farray_getListOfArraysElem as farray_getListOfArraysElem,
            farray_set,
            farray_get, 
            farray_create,

            // INLET CALLERS
            ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) => 
                inletIds.map(inletId => 
                    codeVariableNames.inletCallers[nodeId][inletId] + ','
                )
            )}
        }
    `
}

export const compileOutletListeners = ({
    outletListenerSpecs,
    codeVariableNames,
}: Compilation) => {
    return renderCode`
        ${Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const outletListenerVariableName =
                    codeVariableNames.outletListeners[nodeId][outletId]
                return `
                    export declare function ${outletListenerVariableName}(m: Message): void
                `
            })
        )}
    `
}
