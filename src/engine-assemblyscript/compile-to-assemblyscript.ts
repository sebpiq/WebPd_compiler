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

import { traversal } from '@webpd/dsp-graph'
import { renderCode } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileInitialize from '../engine-common/compile-initialize'
import compileLoop from '../engine-common/compile-loop'
import { Compilation } from '../types'
import generateCoreCode from './core-code'
import { AssemblyScriptWasmEngineCode, EngineMetadata } from './types'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const {
        audioSettings,
        inletCallerSpecs,
        outletListenerSpecs,
        engineVariableNames,
    } = compilation
    const { channelCount } = audioSettings
    const metadata: EngineMetadata = {
        compilation: {
            audioSettings,
            inletCallerSpecs,
            outletListenerSpecs,
            engineVariableNames,
        },
    }
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const { FloatArray } = engineVariableNames.types
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}

        const metadata: string = '${JSON.stringify(metadata)}'
        let ${globs.input}: FloatArray = new ${FloatArray}(0)
        let ${globs.output}: FloatArray = new ${FloatArray}(0)
    
        ${compileDeclare(compilation, graphTraversal)}
        ${compileOutletListeners(compilation)}
        
        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            ${globs.input} = new ${FloatArray}(${globs.blockSize} * ${channelCount.in.toString()})
            ${globs.output} = new ${FloatArray}(${globs.blockSize} * ${channelCount.out.toString()})
            ${compileInitialize(compilation, graphTraversal)}
        }

        export function getInput(): ${FloatArray} { return ${globs.input} }

        export function getOutput(): ${FloatArray} { return ${globs.output} }

        export function loop(): void {
            ${compileLoop(compilation, graphTraversal)}
        }

        export function setArray(arrayName: string, array: FloatArray): void {
            ${globs.arrays}.set(arrayName, array)
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
            x_msg_createArray as msg_createArray,
            x_msg_pushToArray as msg_pushToArray,
            x_msg_getTokenTypes as msg_getTokenTypes,
            msg_writeStringToken,
            msg_writeFloatToken,
            msg_readStringToken,
            msg_readFloatToken,
            MSG_FLOAT_TOKEN,
            MSG_STRING_TOKEN,

            // TARRAY EXPORTS
            x_tarray_createListOfArrays as tarray_createListOfArrays,
            x_tarray_pushToListOfArrays as tarray_pushToListOfArrays,
            x_tarray_getListOfArraysLength as tarray_getListOfArraysLength,
            x_tarray_getListOfArraysElem as tarray_getListOfArraysElem,
            tarray_create,

            // INLET CALLERS
            ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) => 
                inletIds.map(inletId => 
                    engineVariableNames.inletCallers[nodeId][inletId] + ','
                )
            )}
        }
    `
}

export const compileOutletListeners = ({
    outletListenerSpecs,
    engineVariableNames,
}: Compilation) => {
    return renderCode`
        ${Object.entries(outletListenerSpecs).map(
            ([nodeId, outletIds]) =>
                outletIds.map((outletId) => {
                    const outletListenerVariableName =
                        engineVariableNames.outletListeners[nodeId][
                            outletId
                        ]
                    return `
                    export declare function ${outletListenerVariableName}(m: Message): void
                `
                })
        )}
    `
}
