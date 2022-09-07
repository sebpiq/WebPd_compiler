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
import assemblyscriptCoreCode from './core-code.asc'
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import compileDeclare from '../engine-common/compile-declare'
import compileInitialize from '../engine-common/compile-initialize'
import compileLoop from '../engine-common/compile-loop'
import { Compilation } from '../types'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import { AssemblyScriptWasmEngineCode } from './types'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const { audioSettings } = compilation
    const { bitDepth, channelCount } = audioSettings
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const MACROS = compilation.macros
    const FloatType = bitDepth === 32 ? 'f32' : 'f64'
    const FloatArrayType = MACROS.floatArrayType(compilation)
    const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
    const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    const CORE_CODE = assemblyscriptCoreCode
        .replaceAll('${FloatType}', FloatType)
        .replaceAll('${FloatArrayType}', FloatArrayType)
        .replaceAll('${getFloat}', getFloat)
        .replaceAll('${setFloat}', setFloat)
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_FLOAT}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_FLOAT
            ].toString()
        )
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_STRING}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_STRING
            ].toString()
        )

    // prettier-ignore
    return renderCode`
        ${CORE_CODE}

        let ${MACROS.typedVarFloatArray(compilation, globs.output)} = new ${FloatArrayType}(0)
    
        ${compileDeclare(compilation, graphTraversal)}
        ${compileMessageListeners(compilation)}
        ${compilePorts(compilation, { FloatType })}
        
        export function configure(sampleRate: ${FloatType}, blockSize: i32): ${FloatArrayType} {
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            ${globs.output} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.toString()})
            ${compileInitialize(compilation, graphTraversal)}
            return ${globs.output}
        }

        export function loop(): void {
            for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                ${globs.frame}++
                ${compileLoop(compilation, graphTraversal)}
            }
        }

        const ${globs.arrays} = new Map<string,${FloatArrayType}>()

        export function setArray(arrayName: string, buffer: ArrayBuffer): void {
            const array = bufferToArrayOfFloats(buffer)
            ${globs.arrays}.set(arrayName, array)
        }
    `
}

export const compilePorts = (
    { portSpecs, engineVariableNames }: Compilation,
    { FloatType }: { FloatType: string }
) => {
    // prettier-ignore
    return renderCode`
        ${Object.entries(portSpecs).map(([variableName, spec]) => {
            // TODO : uniformize names of types 'float', 'messages', etc ...
            const portsVariableNames = engineVariableNames.ports[variableName]
            return `
                ${spec.access.includes('r') && spec.type === 'float' ? `
                    export function ${portsVariableNames.r}(): ${FloatType} { 
                        return ${variableName} 
                    }
                    `: ''}
                ${spec.access.includes('r') && spec.type === 'messages' ? `
                    export function ${portsVariableNames.r}_length(): i32 { 
                        return ${variableName}.length
                    }
                    export function ${portsVariableNames.r}_elem(index: i32): Message { 
                        return ${variableName}[index]
                    }
                `: ''}
                ${spec.access.includes('w') && spec.type === 'float' ? `
                    export function ${portsVariableNames.w}(value: ${FloatType}): void { 
                        ${variableName} = value
                    }
                `: ''}
                ${spec.access.includes('w') && spec.type === 'messages' ? `
                    export function ${portsVariableNames.w}(messages: Message[]): void { 
                        ${variableName} = messages
                    }
                `: ''}
            `
        })}
    `
}

export const compileMessageListeners = (compilation: Compilation) => {
    return renderCode`
        ${Object.entries(compilation.inletListeners).map(([nodeId, inletIds]) =>
            inletIds.map(inletId => {
                const inletListenerVariableName = compilation.engineVariableNames.inletListeners[nodeId][inletId]
                // prettier-ignore
                return `
                    export declare function ${inletListenerVariableName}(): void
                `
            })
        )}
    `
}