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
import { getNodeImplementation, renderCode } from '../compile-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const { macros } = compilation
    const { g: globs, types } = compilation.codeVariableNames

    // prettier-ignore
    return renderCode`
        ${globs.iterFrame} = 0
        ${globs.iterOutlet} = 0
        ${globs.frame} = 0

        ${graphTraversal.map((node) => {
            const nodeInitialize = getNodeImplementation(compilation.nodeImplementations, node.type).initialize
            return [
                nodeInitialize ? nodeInitialize(
                    node,
                    {
                        ...compilation.codeVariableNames.n[node.id],
                        globs,
                        macros,
                        types,
                    },
                    compilation
                ): '',
            ]
        })}
    `
}
