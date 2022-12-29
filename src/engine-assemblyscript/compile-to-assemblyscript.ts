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
import { generate as generateCoreCode } from './core-code'
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
    const { FloatType, FloatArrayType } = engineVariableNames.types
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}

        let ${globs.input}: FloatArray = new ${FloatArrayType}(0)
        let ${globs.output}: FloatArray = new ${FloatArrayType}(0)
        export const metadata: string = '${JSON.stringify(metadata)}'
        const ${globs.arrays} = new Map<string,${FloatArrayType}>()
    
        ${compileDeclare(compilation, graphTraversal)}
        ${compileInletListeners(compilation)}
        ${compileAccessors(compilation, { FloatType })}
        
        export function configure(sampleRate: ${FloatType}, blockSize: i32): void {
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            ${globs.input} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.in.toString()})
            ${globs.output} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.out.toString()})
            ${compileInitialize(compilation, graphTraversal)}
        }

        export function getInput(): ${FloatArrayType} { return ${globs.input} }

        export function getOutput(): ${FloatArrayType} { return ${globs.output} }

        export function loop(): void {
            for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                ${globs.frame}++
                ${compileLoop(compilation, graphTraversal)}
            }
        }

        export function setArray(arrayName: string, array: FloatArray): void {
            ${globs.arrays}.set(arrayName, array)
        }
    `
}

export const compileAccessors = (
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
