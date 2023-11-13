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

import { getNodeImplementation } from './compile-helpers'
import { getters } from '../dsp-graph'
import { Compilation } from './types'
import { ast } from '../ast/declare'

export default (compilation: Compilation) => {
    const {
        graph,
        graphTraversalLoop,
        codeVariableNames,
        precompilation,
        nodeImplementations,
    } = compilation
    const { globs } = codeVariableNames

    // prettier-ignore
    return ast`
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            _commons_emitFrame(${globs.frame})
            ${graphTraversalLoop.map((nodeId) => {
                const { state } = codeVariableNames.nodes[nodeId]
                const { outs, ins, snds } = precompilation[nodeId]
                const node = getters.getNode(graph, nodeId)
                const nodeImplementation = getNodeImplementation(
                    nodeImplementations,
                    node.type
                )

                if (nodeImplementation.generateLoopInline) {
                    const outletId = Object.keys(node.outlets)[0]
                    return `${outs[outletId]} = ${nodeImplementation.generateLoopInline({
                        globs,
                        node,
                        state,
                        ins,
                        compilation,
                    })}`
                
                } else if (nodeImplementation.generateLoop) {
                    return nodeImplementation.generateLoop({
                        globs,
                        node,
                        state,
                        ins,
                        outs,
                        snds,
                        compilation,
                    })

                } else {
                    throw new Error(`No loop to generate for node ${node.type}:${nodeId}`)
                }
            })}
            ${globs.frame}++
        }
    `
}
