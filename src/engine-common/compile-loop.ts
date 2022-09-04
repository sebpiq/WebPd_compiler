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
import { renderCode } from '../code-helpers'
import { Code } from '../types'
import { Compilation } from '../compilation'

export default (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const { messageListenerSpecs } = compilation.settings
    const globs = compilation.variableNames.g
    // prettier-ignore
    return renderCode`${[
        graphTraversal.map((node) => {
            const nodeVariableNames = compilation.variableNames.n[node.id]
            const inletsVariableNames = Object.values(nodeVariableNames.ins)
            return [
                // 
                Object.keys(messageListenerSpecs)
                    .filter(variableName => inletsVariableNames.includes(variableName))
                    .map(variableName => `
                        if (${variableName}.length) {
                            messageListener_${variableName}()
                        }
                    `),
                
                // 1. Node loop implementation
                compilation.getNodeImplementation(node.type).loop(
                    node,
                    {
                        ...nodeVariableNames,
                        globs,
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
                            const { outs: sourceOuts } = nodeVariableNames
                            const { ins: sinkIns } = compilation.variableNames.n[
                                sinkNodeId
                            ]
                            return getters.getOutlet(node, outletId).type === 'control' ? `
                            for (${globs.iterOutlet} = 0; ${globs.iterOutlet} < ${sourceOuts[outletId]}.length; ${globs.iterOutlet}++) {
                                ${sinkIns[inletId]}.push(${sourceOuts[outletId]}[${globs.iterOutlet}])
                            }` : `${sinkIns[inletId]} = ${sourceOuts[outletId]}`
                        }
                    ),
            ]
        }),
        // 3. Control inlets / outlets cleanup
        graphTraversal.map((node) => {
            const { ins, outs } = compilation.variableNames.n[node.id]
            return [
                Object.values(node.inlets)
                    .filter((inlet) => inlet.type === 'control')
                    .map((inlet) => `
                        if (${ins[inlet.id]}.length) {
                            ${ins[inlet.id]} = []
                        }
                    `),
                Object.values(node.outlets)
                    .filter((outlet) => outlet.type === 'control')
                    .map((outlet) => `
                        if (${outs[outlet.id]}.length) {
                            ${outs[outlet.id]} = []
                        }
                    `),
            ]
        }),
    ]}`
}
