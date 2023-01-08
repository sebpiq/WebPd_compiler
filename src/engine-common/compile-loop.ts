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

import { traversal, DspGraph } from '@webpd/dsp-graph'
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
        engineVariableNames,
        macros,
        nodeImplementations,
    } = compilation
    const { g: globs, types } = engineVariableNames
    return renderCode`${
        graphTraversal.map((node) => {
            const nodeLoop = getNodeImplementation(nodeImplementations, node.type).loop
            if (!nodeLoop) {
                return ''
            }

            const nodeVariableNames = engineVariableNames.n[node.id]
            return [
                // 1. Node loop implementation
                nodeLoop(
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
                traversal.listConnectionsOut(
                    traversal
                        .removeDeadSinks(node.sinks, traversalNodeIds), node.id)
                    .filter(([{ portletId }]) => node.outlets[portletId].type === 'signal')
                    .map(
                        ([
                            { portletId: outletId },
                            { nodeId: sinkNodeId, portletId: inletId },
                        ]) => {
                            const { outs: sourceOuts } = nodeVariableNames
                            const { ins: sinkIns } = engineVariableNames.n[sinkNodeId]
                            return `${sinkIns[inletId]} = ${sourceOuts[outletId]}`
                        }
                    ),
            ]
        })
    }`
}
