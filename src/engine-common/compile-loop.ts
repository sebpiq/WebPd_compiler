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
import { getNodeImplementation } from '../compile-helpers'
import { renderCode } from '../functional-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
) => {
    const { globs } = compilation.codeVariableNames

    // prettier-ignore
    return `
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            ${loopIteration(compilation, graphTraversal)}
            ${globs.frame}++
        }
    `
}

const loopIteration = (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const { codeVariableNames, macros, nodeImplementations } = compilation
    const { globs } = codeVariableNames
    return renderCode`${graphTraversal.map((node) => {
        const { outs, ins, snds, state } = codeVariableNames.nodes[node.id]
        const nodeImplementation = getNodeImplementation(
            nodeImplementations,
            node.type
        )

        const nodeVariableNames = codeVariableNames.nodes[node.id]
        return [
            // 1. Node loop implementation
            nodeImplementation.loop({
                macros,
                globs,
                node,
                state,
                ins,
                outs,
                snds,
                compilation,
            }),

            // 2. Node outs to sinks ins
            traversal
                .listConnectionsOut(
                    traversal.removeDeadSinks(node.sinks, traversalNodeIds),
                    node.id
                )
                .filter(
                    ([{ portletId }]) =>
                        node.outlets[portletId].type === 'signal'
                )
                .map(
                    ([
                        { portletId: outletId },
                        { nodeId: sinkNodeId, portletId: inletId },
                    ]) => {
                        const { outs: sourceOuts } = nodeVariableNames
                        const { ins: sinkIns } =
                            codeVariableNames.nodes[sinkNodeId]
                        return `${sinkIns[inletId]} = ${sourceOuts[outletId]}`
                    }
                ),
        ]
    })}`
}
