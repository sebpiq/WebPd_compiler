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
import { Compilation, EngineVariableNames, AccessorSpecs } from '../types'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import { AssemblyScriptWasmEngineCode, EngineMetadata } from './types'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const {
        audioSettings,
        accessorSpecs,
        inletListenerSpecs: inletListenerSpecs,
        engineVariableNames,
    } = compilation
    const { bitDepth, channelCount } = audioSettings
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
    const macros = compilation.macros
    const FloatType = bitDepth === 32 ? 'f32' : 'f64'
    const FloatArrayType = macros.floatArrayType(compilation)
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

        let ${macros.typedVarFloatArray(compilation, globs.output)} = new ${FloatArrayType}(0)
        let ${macros.typedVarFloatArray(compilation, globs.input)} = new ${FloatArrayType}(0)
        export const metadata: string = '${JSON.stringify(metadata)}'
    
        ${compileDeclare(compilation, graphTraversal)}
        ${compileInletListeners(compilation)}
        ${compilePorts(compilation, { FloatType })}
        
        export function configure(sampleRate: ${FloatType}, blockSize: i32): void {
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            ${globs.output} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.toString()})
            ${globs.input} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.toString()})
            ${globs.input}[0] = 1.1
            ${globs.input}[1] = 2.2
            ${globs.input}[2] = 3.3
            ${compileInitialize(compilation, graphTraversal)}
        }

        export function getOutput(): ${FloatArrayType} { return ${globs.output} }
        export function getInput(): ${FloatArrayType} { return ${globs.input} }

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
    { accessorSpecs, engineVariableNames }: Compilation,
    { FloatType }: { FloatType: string }
) => {
    // prettier-ignore
    return renderCode`
        ${Object.entries(accessorSpecs).map(([variableName, spec]) => {
            // TODO : uniformize names of types 'signal', 'message', etc ...
            const accessorsVariableNames = engineVariableNames.accessors[variableName]
            return `
                ${spec.access.includes('r') && spec.type === 'signal' ? `
                    export function ${accessorsVariableNames.r}(): ${FloatType} { 
                        return ${variableName} 
                    }
                    `: ''}
                ${spec.access.includes('r') && spec.type === 'message' ? `
                    export function ${accessorsVariableNames.r_length}(): i32 { 
                        return ${variableName}.length
                    }
                    export function ${accessorsVariableNames.r_elem}(index: i32): Message { 
                        return ${variableName}[index]
                    }
                `: ''}
                ${spec.access.includes('w') && spec.type === 'signal' ? `
                    export function ${accessorsVariableNames.w}(value: ${FloatType}): void { 
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
                        compilation.engineVariableNames.inletListenerSpecs[
                            nodeId
                        ][inletId]
                    // prettier-ignore
                    return `
                    export declare function ${inletListenerVariableName}(): void
                `
                })
        )}
    `
}

export const attachAccessorsVariableNames = (
    engineVariableNames: EngineVariableNames,
    accessorSpecs: AccessorSpecs
): void => {
    Object.entries(accessorSpecs).forEach(([variableName, accessorSpec]) => {
        engineVariableNames.accessors[variableName] = {}
        if (accessorSpec.access.includes('r')) {
            if (accessorSpec.type === 'message') {
                // Implemented by engine
                engineVariableNames.accessors[variableName][
                    'r_length'
                ] = `read_${variableName}_length`
                engineVariableNames.accessors[variableName][
                    'r_elem'
                ] = `read_${variableName}_elem`
                // Implemented by bindings
                engineVariableNames.accessors[variableName][
                    'r'
                ] = `read_${variableName}`
            } else {
                engineVariableNames.accessors[variableName][
                    'r'
                ] = `read_${variableName}`
            }
        }
        if (accessorSpec.access.includes('w')) {
            engineVariableNames.accessors[variableName][
                'w'
            ] = `write_${variableName}`
        }
    })
}
