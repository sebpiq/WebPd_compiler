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
import assemblyscriptCoreCode from './engine-assemblyscript/core-code.asc'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './engine-assemblyscript/bindings'
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from './constants'
import { compilePorts } from './engine-assemblyscript/compile'

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
        const {portSpecs} = compilation.settings
        return renderCode`
            const ${globs.arrays} = new Map()

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
                setArray: (arrayName, array) => { 
                    ${globs.arrays}.set(arrayName, array)
                },
                ports: {
                    ${Object.entries(portSpecs).map(([variableName, spec]) => {
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
        const {channelCount, bitDepth} = compilation.settings
        const MACROS = compilation.getMacros()
        const FloatType = bitDepth === 32 ? 'f32' : 'f64'
        const FloatArrayType = MACROS.floatArrayType()
        const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
        const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
        const CORE_CODE = assemblyscriptCoreCode
            .replaceAll('${FloatType}', FloatType)
            .replaceAll('${FloatArrayType}', FloatArrayType)
            .replaceAll('${getFloat}', getFloat)
            .replaceAll('${setFloat}', setFloat)
            .replaceAll('${MESSAGE_DATUM_TYPE_FLOAT}', MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT].toString()) 
            .replaceAll('${MESSAGE_DATUM_TYPE_STRING}', MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING].toString())

        return renderCode`
            ${CORE_CODE}

            let ${MACROS.typedVarFloatArray(globs.output)} = new ${FloatArrayType}(0)
        
            ${compileSetup(compilation, graphTraversal)}

            export function configure(blockSize: i32): ${FloatArrayType} {
                ${globs.blockSize} = blockSize
                ${globs.output} = new ${FloatArrayType}(${globs.blockSize} * ${channelCount.toString()})
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

            ${compilePorts(compilation, {FloatType, FloatArrayType})}
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