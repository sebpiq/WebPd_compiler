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

import { getNodeImplementation, renderCode, wrapMacros } from '../compile-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal
): Code => {
    const globs = compilation.engineVariableNames.g
    const MACROS = wrapMacros(compilation.macros, compilation)
    // prettier-ignore
    return renderCode`
        let ${MACROS.typedVarInt(globs.iterFrame)}
        let ${MACROS.typedVarInt(globs.iterOutlet)}
        let ${MACROS.typedVarInt(globs.frame)}
        let ${MACROS.typedVarInt(globs.blockSize)}
        let ${MACROS.typedVarFloat(globs.sampleRate)}

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.engineVariableNames.n[node.id]
            const nodeDeclare = getNodeImplementation(compilation.nodeImplementations, node.type).declare
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'control'
                        ? `let ${MACROS.typedVarMessageArray(ins[inlet.id])}`
                        : `let ${MACROS.typedVarFloat(ins[inlet.id])}`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'control'
                        ? `let ${MACROS.typedVarMessageArray(outs[outlet.id])}`
                        : `let ${MACROS.typedVarFloat(outs[outlet.id])}`
                ),
                nodeDeclare ? nodeDeclare(
                    node,
                    {
                        ...compilation.engineVariableNames.n[node.id],
                        globs: globs,
                        MACROS,
                    },
                    compilation
                ): '',
            ]
        })}
    `
}
