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

import { traversal, getters } from '@webpd/dsp-graph'
import { CompilerSettings, JavaScriptEngineCode, AssemblyScriptEngineCode, Code } from './types'
import { NodeImplementations } from './types'
import { Compilation } from './compilation'
import { renderCode } from './code-helpers'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptEngineCode => {
    const compilation = new Compilation(
        graph,
        nodeImplementations,
        compilerSettings
    )
    return compile(compilation)
}

export const compile = (
    compilation: Compilation
): JavaScriptEngineCode | AssemblyScriptEngineCode => {
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.variableNames.g

    if (compilation.settings.target === 'javascript') {
        const {ports} = compilation.settings
        return renderCode`
            ${compileSetup(compilation, graphTraversal)}

            return {
                configure: (blockSize) => {
                    ${globs.blockSize} = blockSize
                },
                loop: (${globs.output}) => {
                    for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                        ${globs.frame}++
                        ${compileLoop(compilation, graphTraversal)}
                    }
                },
                ports: {
                    ${Object.entries(ports).map(([variableName, spec]) => {
                        const portsCode: Array<Code> = []
                        if (spec.access.includes('r')) {
                            portsCode.push(`read_${variableName}: () => ${variableName},`)
                        }
                        if (spec.access.includes('w')) {
                            portsCode.push(`write_${variableName}: (value) => ${variableName} = value,`)
                        }
                        return portsCode
                    })}
                }
            }
        `
    } else if (compilation.settings.target === 'assemblyscript') {
        const {channelCount, bitDepth, ports} = compilation.settings
        const MACROS = compilation.getMacros()
        const FloatType = bitDepth === 32 ? 'f32' : 'f64'
        return renderCode`
            type Message = DataView

            let ${MACROS.typedVarFloatArray(globs.output)} = new ${MACROS.floatArrayType()}(0)
        
            ${compileSetup(compilation, graphTraversal)}

            export function configure(blockSize: i32): ${MACROS.floatArrayType()} {
                ${globs.blockSize} = blockSize
                ${globs.output} = new ${MACROS.floatArrayType()}(${globs.blockSize} * ${channelCount.toString()})
                return ${globs.output}
            }

            export function loop(): void {
                for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                    ${globs.frame}++
                    ${compileLoop(compilation, graphTraversal)}
                }
            }

            ${Object.entries(ports).map(([variableName, spec]) => {
                const portsCode: Array<Code> = []
                if (spec.access.includes('r')) {
                    if (spec.type === 'float') {
                        portsCode.push(`
                            export function read_${variableName}(): ${FloatType} { 
                                return ${variableName} 
                            }
                        `)
                    } else {
                        portsCode.push(`
                            export function read_${variableName}(): Message[] { 
                                return ${variableName} 
                            }
                        `)
                    }
                }
                if (spec.access.includes('w')) {
                    if (spec.type === 'float') {
                        portsCode.push(`
                            export function write_${variableName}(value: ${FloatType}): void { 
                                ${variableName} = value
                            }
                        `)
                    } else {
                        portsCode.push(`
                            export function write_${variableName}(messages: Message[]): void { 
                                ${variableName} = messages
                            }
                        `)
                    }
                }
                return portsCode
            })}
        `
    }
}

export const compileSetup = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): Code => {
    const globs = compilation.variableNames.g
    const MACROS = compilation.getMacros()
    return renderCode`
        let ${MACROS.typedVarInt(globs.iterFrame)} = 0
        let ${MACROS.typedVarInt(globs.iterOutlet)} = 0
        let ${MACROS.typedVarInt(globs.frame)} = -1
        let ${MACROS.typedVarInt(globs.blockSize)} = 0

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.variableNames.n[node.id]
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'control'
                        ? `let ${MACROS.typedVarMessageArray(ins[inlet.id])} = []`
                        : `let ${MACROS.typedVarFloat(ins[inlet.id])} = 0`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'control'
                        ? `let ${MACROS.typedVarMessageArray(outs[outlet.id])} = []`
                        : `let ${MACROS.typedVarFloat(outs[outlet.id])} = 0`
                ),
                compilation.getNodeImplementation(node.type).setup(
                    node,
                    {
                        ...compilation.variableNames.n[node.id],
                        globs: globs,
                        MACROS: compilation.getMacros(),
                    },
                    compilation.settings
                ),
            ]
        })}
    `   
}

export const compileLoop = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const globs = compilation.variableNames.g
    return renderCode`${[
        graphTraversal.map((node) => [
            // 1. Node loop implementation
            compilation.getNodeImplementation(node.type).loop(
                node,
                {
                    ...compilation.variableNames.n[node.id],
                    globs: compilation.variableNames.g,
                    MACROS: compilation.getMacros(),
                },
                compilation.settings
            ),

            // 2. Node outs to sinks ins
            traversal
                .listConnectionsOut(node)
                // Make sure we omit nodes that are not connected to an end sink
                .filter(([_, { nodeId: sinkNodeId }]) =>
                    traversalNodeIds.includes(sinkNodeId)
                )
                .map(
                    ([
                        { portletId: outletId },
                        { nodeId: sinkNodeId, portletId: inletId },
                    ]) => {
                        const {
                            outs: sourceOuts,
                        } = compilation.variableNames.n[node.id]
                        const { ins: sinkIns } = compilation.variableNames.n[
                            sinkNodeId
                        ]
                        return getters.getOutlet(node, outletId).type ===
                            'control'
                            ? `
                        for (${globs.iterOutlet} = 0; ${globs.iterOutlet} < ${sourceOuts[outletId]}.length; ${globs.iterOutlet}++) {
                            ${sinkIns[inletId]}.push(${sourceOuts[outletId]}[${globs.iterOutlet}])
                        }`
                            : `${sinkIns[inletId]} = ${sourceOuts[outletId]}`
                    }
                ),
        ]),
        // 3. Control inlets / outlets cleanup
        graphTraversal.map((node) => {
            const { ins, outs } = compilation.variableNames.n[node.id]
            return [
                Object.values(node.inlets)
                    .filter((inlet) => inlet.type === 'control')
                    .map(
                        (inlet) => `
                        if (${ins[inlet.id]}.length) {
                            ${ins[inlet.id]} = []
                        }
                    `
                    ),
                Object.values(node.outlets)
                    .filter((outlet) => outlet.type === 'control')
                    .map(
                        (outlet) => `
                        if (${outs[outlet.id]}.length) {
                            ${outs[outlet.id]} = []
                        }
                    `
                    ),
            ]
        })
    ]}`
}