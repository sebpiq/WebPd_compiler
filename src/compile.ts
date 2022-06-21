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
    const globs = compilation.variableNames.g
    // !!! The `SET_VARIABLE` port passes values by reference, therefore calling it twice on several
    // variables with the same array as `variableValue` for example might have unexpected effects.
    return renderCode`
        ${compileSetup(compilation, traversal.breadthFirst(compilation.graph))}
        return {
            loop: () => {
                ${compileLoop(
                    compilation,
                    traversal.breadthFirst(compilation.graph)
                )}
                return [${globs.output.join(', ')}]
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
}

export const compileSetup = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): PdEngine.Code => {
    const globs = compilation.variableNames.g
    return renderCode`
        let ${globs.iterOutlet} = 0
        let ${globs.frame} = -1
        const ${globs.isNumber} = (v) => typeof v === 'number'
        ${globs.output.map((n) => `let ${n} = 0`)}

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.variableNames.n[node.id]
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'control'
                        ? `let ${ins[inlet.id]} = []`
                        : `let ${ins[inlet.id]} = 0`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'control'
                        ? `let ${outs[outlet.id]} = []`
                        : `let ${outs[outlet.id]} = 0`
                ),
                compilation.getNodeImplementation(node.type).setup(
                    node,
                    {
                        ...compilation.variableNames.n[node.id],
                        globs: globs,
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
    return renderCode`
        ${globs.frame}++

        ${graphTraversal.map((node) => [
            // 1. Node loop implementation
            compilation.getNodeImplementation(node.type).loop(
                node,
                {
                    ...compilation.variableNames.n[node.id],
                    globs: compilation.variableNames.g,
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
        ])}

        ${
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
        }
    `
}
