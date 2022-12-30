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
        accessorSpecs,
        inletListenerSpecs: inletListenerSpecs,
        engineVariableNames,
    } = compilation
    const { channelCount } = audioSettings
    const metadata: EngineMetadata = {
        compilation: {
            audioSettings,
            accessorSpecs,
            inletListenerSpecs,
            engineVariableNames,
        },
    }
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const { Float, FloatArray } = engineVariableNames.types
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}

        let ${globs.input}: FloatArray = new ${FloatArray}(0)
        let ${globs.output}: FloatArray = new ${FloatArray}(0)
        export const metadata: string = '${JSON.stringify(metadata)}'
        const ${globs.arrays} = new Map<string,FloatArray>()
    
        ${compileDeclare(compilation, graphTraversal)}
        ${compileInletListeners(compilation)}
        ${compileAccessors(compilation, { Float })}
        
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
            for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                ${globs.frame}++
                ${compileLoop(compilation, graphTraversal)}
            }
        }

        export function setArray(arrayName: string, array: FloatArray): void {
            ${globs.arrays}.set(arrayName, array)
        }

        // FS IMPORTS
        export declare function fs_requestReadSoundFile (id: fs_OperationId, url: Url, info: DecodingInfo): void
        export declare function fs_requestReadSoundStream (id: fs_OperationId, url: Url, info: DecodingInfo): void
        export declare function fs_requestWriteSoundFile (id: fs_OperationId, url: Url, sound: FloatArray[], info: EncodingInfo): void
        export declare function fs_requestCloseSoundStream (id: fs_OperationId): void

        export {
            // FS EXPORTS
            x_fs_readSoundFileResponse as fs_readSoundFileResponse,
            x_fs_writeSoundFileResponse as fs_writeSoundFileResponse,
            x_fs_soundStreamData as fs_soundStreamData,
            x_fs_soundStreamClose as fs_soundStreamClose,

            // MSG EXPORTS
            x_msg_create as msg_create,
            x_msg_createArray as msg_createArray,
            x_msg_pushToArray as msg_pushToArray,
            x_msg_getDatumTypes as msg_getDatumTypes,
            msg_writeStringDatum,
            msg_writeFloatDatum,
            msg_readStringDatum,
            msg_readFloatDatum,
            MSG_DATUM_TYPE_FLOAT,
            MSG_DATUM_TYPE_STRING,

            // TARRAY EXPORTS
            x_tarray_createListOfArrays as tarray_createListOfArrays,
            x_tarray_pushToListOfArrays as tarray_pushToListOfArrays,
            x_tarray_getListOfArraysLength as tarray_getListOfArraysLength,
            x_tarray_getListOfArraysElem as tarray_getListOfArraysElem,
            x_tarray_create as tarray_create,
        }
    `
}

export const compileAccessors = (
    { accessorSpecs, engineVariableNames }: Compilation,
    { Float }: { Float: string }
) => {
    // prettier-ignore
    return renderCode`
        ${Object.entries(accessorSpecs).map(([variableName, spec]) => {
            const accessorsVariableNames = engineVariableNames.accessors[variableName]
            return `
                ${spec.access.includes('r') && spec.type === 'signal' ? `
                    export function ${accessorsVariableNames.r}(): ${Float} { 
                        return ${variableName} 
                    }
                    `: ''}
                ${spec.access.includes('r') && spec.type === 'message' ? `
                    export function ${accessorsVariableNames.r_length}(): Int { 
                        return ${variableName}.length
                    }
                    export function ${accessorsVariableNames.r_elem}(index: Int): Message { 
                        return ${variableName}[index]
                    }
                `: ''}
                ${spec.access.includes('w') && spec.type === 'signal' ? `
                    export function ${accessorsVariableNames.w}(value: ${Float}): void { 
                        ${variableName} = value
                    }
                `: ''}
                ${spec.access.includes('w') && spec.type === 'message' ? `
                    export function ${accessorsVariableNames.w}(messages: Message[]): void { 
                        ${variableName} = messages
                    }
                `: ''}
            `
        })}
    `
}

export const compileInletListeners = (compilation: Compilation) => {
    return renderCode`
        ${Object.entries(compilation.inletListenerSpecs).map(
            ([nodeId, inletIds]) =>
                inletIds.map((inletId) => {
                    const inletListenerVariableName =
                        compilation.engineVariableNames.inletListeners[nodeId][
                            inletId
                        ]
                    // prettier-ignore
                    return `
                    export declare function ${inletListenerVariableName}(): void
                `
                })
        )}
    `
}
