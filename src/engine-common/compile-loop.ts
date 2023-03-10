/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd 
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { getNodeImplementation } from '../compile-helpers'
import { getters } from '../dsp-graph'
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
            _commons_emitFrame(${globs.frame})
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
