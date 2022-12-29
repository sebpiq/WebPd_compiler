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
} from '../compile-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const { macros } = compilation
    const { g: globs, types } = compilation.engineVariableNames
    // prettier-ignore
    return renderCode`
        let ${macros.typedVar(globs.iterFrame, 'Int')}
        let ${macros.typedVar(globs.iterOutlet, 'Int')}
        let ${macros.typedVar(globs.frame, 'Int')}
        let ${macros.typedVar(globs.blockSize, 'Int')}
        let ${macros.typedVar(globs.sampleRate, 'Float')}

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.engineVariableNames.n[node.id]
            const nodeDeclare = getNodeImplementation(compilation.nodeImplementations, node.type).declare
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'message'
                        ? `let ${macros.typedVar(ins[inlet.id], 'Array<Message>')} = []`
                        : `let ${macros.typedVar(ins[inlet.id], 'Float')}`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'message'
                        ? `let ${macros.typedVar(outs[outlet.id], 'Array<Message>')} = []`
                        : `let ${macros.typedVar(outs[outlet.id], 'Float')}`
                ),
                nodeDeclare ? nodeDeclare(
                    node,
                    {
                        ...compilation.engineVariableNames.n[node.id],
                        globs,
                        types,
                        macros,
                    },
                    compilation
                ): '',
            ]
        })}
    `
}
