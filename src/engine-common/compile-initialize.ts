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
        ${globs.iterFrame} = 0
        ${globs.iterOutlet} = 0
        ${globs.frame} = -1

        ${graphTraversal.map((node) => {
            const { ins, outs } = compilation.engineVariableNames.n[node.id]
            const nodeInitialize = getNodeImplementation(compilation.nodeImplementations, node.type).initialize
            return [
                Object.values(node.inlets).map((inlet) =>
                    inlet.type === 'control'
                        ? `${ins[inlet.id]} = []`
                        : `${ins[inlet.id]} = 0`
                ),
                Object.values(node.outlets).map((outlet) =>
                    outlet.type === 'control'
                        ? `${outs[outlet.id]} = []`
                        : `${outs[outlet.id]} = 0`
                ),
                nodeInitialize ? nodeInitialize(
                    node,
                    {
                        ...compilation.engineVariableNames.n[node.id],
                        globs,
                        MACROS,
                    },
                    compilation
                ): '',
            ]
        })}
    `
}
