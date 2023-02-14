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

import { getters } from '@webpd/dsp-graph'
import { getNodeImplementation } from '../compile-helpers'
import { renderCode } from '../functional-helpers'
import { Compilation } from '../types'

export default (compilation: Compilation) => {
    const {
        graph,
        graphTraversal,
        codeVariableNames,
        macros,
        nodeImplementations,
    } = compilation
    const { globs } = codeVariableNames
    const graphTraversalNodes = graphTraversal.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )

    // prettier-ignore
    return renderCode`
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            ${graphTraversalNodes.map((node) => {
                const { outs, ins, snds, state } = codeVariableNames.nodes[node.id]
                const nodeImplementation = getNodeImplementation(
                    nodeImplementations,
                    node.type
                )
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
                ]
            })}
            ${globs.frame}++
        }
    `
}
