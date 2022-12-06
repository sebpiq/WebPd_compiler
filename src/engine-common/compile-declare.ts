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

import { DspGraph } from '@webpd/dsp-graph'
import {
    getNodeImplementation,
    renderCode,
    wrapMacros,
} from '../compile-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const globs = compilation.engineVariableNames.g
    const macros = wrapMacros(compilation.macros, compilation)
    // prettier-ignore
    return renderCode`
        let ${macros.typedVarInt(globs.iterFrame)}
        let ${macros.typedVarInt(globs.iterOutlet)}
        let ${macros.typedVarInt(globs.frame)}
        let ${macros.typedVarInt(globs.blockSize)}
        let ${macros.typedVarFloat(globs.sampleRate)}

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.engineVariableNames.n[node.id]
            const nodeDeclare = getNodeImplementation(compilation.nodeImplementations, node.type).declare
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'message'
                        ? `let ${macros.typedVarMessageArray(ins[inlet.id])}`
                        : `let ${macros.typedVarFloat(ins[inlet.id])}`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'message'
                        ? `let ${macros.typedVarMessageArray(outs[outlet.id])}`
                        : `let ${macros.typedVarFloat(outs[outlet.id])}`
                ),
                nodeDeclare ? nodeDeclare(
                    node,
                    {
                        ...compilation.engineVariableNames.n[node.id],
                        globs: globs,
                        macros,
                    },
                    compilation
                ): '',
            ]
        })}
    `
}
