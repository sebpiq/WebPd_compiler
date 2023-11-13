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

import { mapArray } from '../functional-helpers'
import { DspGraph, getters } from '../dsp-graph'
import { getNodeImplementation } from './compile-helpers'
import { createNamespace, nodeNamespaceLabel } from './namespace'
import { Compilation } from './types'
import { Code } from '../ast/types'

type InlinedNodes = { [nodeId: DspGraph.NodeId]: Code }
type InlinedInputs = { [inletId: DspGraph.PortletId]: Code }

export default (
    compilation: Compilation,
    inlineTraversal: DspGraph.GraphTraversal
): Code => {
    const {
        precompilation,
        variableNamesIndex,
        nodeImplementations,
        graph,
    } = compilation
    const { globs } = variableNamesIndex
    const leafNodeId = inlineTraversal.slice(-1)[0]

    const inlinedNodes = inlineTraversal.reduce<InlinedNodes>(
        (inlinedNodes, nodeId) => {
            const { state } = variableNamesIndex.nodes[nodeId]
            const { ins } = precompilation[nodeId]
            const node = getters.getNode(graph, nodeId)
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                node.type
            )

            const inlinedInputs: InlinedInputs = mapArray(
                // Select signal inlets with sources
                Object.values(node.inlets)
                    .map(
                        (inlet) =>
                            [inlet, getters.getSources(node, inlet.id)] as const
                    )
                    .filter(
                        ([inlet, sources]) =>
                            inlet.type === 'signal' &&
                            sources.length > 0 &&
                            // We filter out sources that are not inlinable.
                            // These sources will just be represented by their outlet's 
                            // variable name.
                            inlineTraversal.includes(sources[0].nodeId)
                    ),

                // Build map of inlined inputs
                ([inlet, sources]) => {
                    // Because it's a signal connection, we have only one source per inlet
                    const source = sources[0]
                    if (!(source.nodeId in inlinedNodes)) {
                        throw new Error(
                            `Unexpected error : inlining failed, missing inlined source ${source.nodeId}`
                        )
                    }
                    return [inlet.id, inlinedNodes[source.nodeId]]
                }
            )

            // TODO assemblyscript-upgrade : we need this because of a assemblyscript bug that seems
            // to be fixed in latest version. Remove when upgrading.
            // Bugs when a single variable name is surrounded with brackets : e.g. `(node1_OUTS_0)` 
            // causes compilation error.
            const inlined = nodeImplementation.generateLoopInline({
                globs,
                state,
                ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {
                    ...ins,
                    ...inlinedInputs,
                }),
                node,
                compilation,
            })
            const containsSpace = inlined.includes(' ')
            // END TODO

            return {
                ...inlinedNodes,
                [nodeId]:
                    (containsSpace ? '(': '') +
                    nodeImplementation.generateLoopInline({
                        globs,
                        state,
                        ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {
                            ...ins,
                            ...inlinedInputs,
                        }),
                        node,
                        compilation,
                    }) +
                    (containsSpace ? ')': ''),
            }
        },
        {}
    )

    return inlinedNodes[leafNodeId]
}
