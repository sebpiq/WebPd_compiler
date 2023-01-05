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

import { traversal, getters, DspGraph } from '@webpd/dsp-graph'
import { getNodeImplementation, renderCode } from '../compile-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal,
) => {
    const { g: globs } = compilation.engineVariableNames
    return `
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            ${globs.frame}++
            ${loopIteration(compilation, graphTraversal)}
        }
    `
}

const loopIteration = (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const {
        inletListenerSpecs: inletListenerSpecs,
        engineVariableNames,
        macros,
        nodeImplementations,
    } = compilation
    const { g: globs, types } = engineVariableNames
    // prettier-ignore
    return renderCode`${[
        graphTraversal.map((node) => {
            const nodeVariableNames = engineVariableNames.n[node.id]
            return [
                // 0. Call inlet listeners if some inlets have new messages
                (inletListenerSpecs[node.id] || [])
                    .map(inletId => {
                        const listenerVariableName = engineVariableNames.inletListeners[node.id][inletId]
                        const inletVariableName = nodeVariableNames.ins[inletId]
                        return `
                            if (${inletVariableName}.length) {
                                ${listenerVariableName}()
                            }
                        `
                    }),
                
                // 1. Node loop implementation
                getNodeImplementation(nodeImplementations, node.type).loop(
                    node,
                    {
                        ...nodeVariableNames,
                        globs,
                        macros,
                        types,
                    },
                    compilation
                ),

                // 2. Node outs to sinks ins
                traversal
                    .listConnectionsOut(node)
                    // When `node` has a sink node that is not connected to an end sink, that sink node won't be included
                    // in the traversal, but will still appear in `node.sinks`. 
                    // Therefore, we need to make sure to filter `node.sinks` to exclude sink nodes that don't
                    // appear in the traversal.
                    .filter(([_, { nodeId: sinkNodeId }]) =>
                        traversalNodeIds.includes(sinkNodeId)
                    )
                    .map(
                        ([
                            { portletId: outletId },
                            { nodeId: sinkNodeId, portletId: inletId },
                        ]) => {
                            const { outs: sourceOuts } = nodeVariableNames
                            const { ins: sinkIns } = engineVariableNames.n[
                                sinkNodeId
                            ]
                            return getters.getOutlet(node, outletId).type === 'message' ? `
                            for (${globs.iterOutlet} = 0; ${globs.iterOutlet} < ${sourceOuts[outletId]}.length; ${globs.iterOutlet}++) {
                                ${sinkIns[inletId]}.push(${sourceOuts[outletId]}[${globs.iterOutlet}])
                            }` : `${sinkIns[inletId]} = ${sourceOuts[outletId]}`
                        }
                    ),
            ]
        }),
        // 3. Message inlets / outlets cleanup
        graphTraversal.map((node) => {
            const { ins, outs } = engineVariableNames.n[node.id]
            return [
                Object.values(node.inlets)
                    .filter((inlet) => inlet.type === 'message')
                    .map((inlet) => `
                        if (${ins[inlet.id]}.length) {
                            ${ins[inlet.id]} = []
                        }
                    `),
                Object.values(node.outlets)
                    .filter((outlet) => outlet.type === 'message')
                    .map((outlet) => `
                        if (${outs[outlet.id]}.length) {
                            ${outs[outlet.id]} = []
                        }
                    `),
            ]
        }),
    ]}`
}
