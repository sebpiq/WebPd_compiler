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
import { CompilerSettings } from './types'
import { NodeImplementations, PortsNames } from './types'
import { Compilation } from './compilation'
import { renderCode } from './code-helpers'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): PdEngine.SignalProcessorCode => {
    const compilation = new Compilation(
        graph,
        nodeImplementations,
        compilerSettings
    )
    return compile(compilation)
}

export const compile = (
    compilation: Compilation
): PdEngine.SignalProcessorCode => {
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.variableNames.g

    if (compilation.settings.target === 'javascript') {
        // !!! The `SET_VARIABLE` port passes values by reference, therefore calling it twice on several
        // variables with the same array as `variableValue` for example might have unexpected effects.
        return renderCode`
            const isNumber = (v) => typeof v === 'number'

            ${compileSetup(compilation, graphTraversal)}

            return {
                configure: (aBlockSize) => {
                    ${globs.blockSize} = aBlockSize
                },
                loop: (${globs.output}) => {
                    for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                        ${globs.frame}++
                        ${compileLoop(compilation, graphTraversal)}
                    }
                },
                ports: {
                    ${PortsNames.GET_VARIABLE}: (variableName) => {
                        return eval(variableName)
                    },
                    ${PortsNames.SET_VARIABLE}: (variableName, variableValue) => {
                        eval(variableName + ' = variableValue')
                    }
                }
            }
        `
    } else if (compilation.settings.target === 'assemblyscript') {
        return renderCode`
            let ${globs.output}: Float64Array
        
            ${compileSetup(compilation, graphTraversal)}

            export function configure(aBlockSize: i32): Float64Array {
                ${globs.blockSize} = aBlockSize
                ${globs.output} = new Float64Array(${globs.blockSize} * ${compilation.settings.channelCount.toString()})
                return ${globs.output}
            }

            export function loop(): void {
                for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                    ${globs.frame}++
                    ${compileLoop(compilation, graphTraversal)}
                }
            }
        `
    }
}

export const compileSetup = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): PdEngine.Code => {
    const globs = compilation.variableNames.g
    const MACROS = compilation.getMacros()
    return renderCode`
        ${MACROS.declareInt(globs.iterFrame, 0)}
        ${MACROS.declareInt(globs.iterOutlet, 0)}
        ${MACROS.declareInt(globs.frame, -1)}
        ${MACROS.declareInt(globs.blockSize, 0)}

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.variableNames.n[node.id]
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'control'
                        ? `${MACROS.declareMessageArray(ins[inlet.id])}`
                        : `${MACROS.declareSignal(ins[inlet.id], 0)}`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'control'
                        ? `${MACROS.declareMessageArray(outs[outlet.id])}`
                        : `${MACROS.declareSignal(outs[outlet.id], 0)}`
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
): PdEngine.Code => {
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
