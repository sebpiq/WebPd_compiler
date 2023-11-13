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
import { AstSequence } from '../ast/types'
import { Sequence, Func, Var } from '../ast/declare'

export default (compilation: Compilation): AstSequence => {
    const {
        graph,
        graphTraversalDeclare,
        variableNamesIndex,
        nodeImplementations,
        outletListenerSpecs,
        precompilation,
        debug,
    } = compilation
    const graphTraversalNodes = graphTraversalDeclare.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )
    const { globs } = variableNamesIndex

    return Sequence([
        graphTraversalNodes.map((node) => {
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                node.type
            )
            const nodeVariableNames = variableNamesIndex.nodes[node.id]
            const nodePrecompilation = precompilation[node.id]
            const nodeMessageReceivers =
                nodeImplementation.generateMessageReceivers
                    ? nodeImplementation.generateMessageReceivers({
                          globs,
                          state: nodeVariableNames.state,
                          snds: nodePrecompilation.snds,
                          node,
                          compilation,
                      })
                    : {}

            return [
                // 1. Declares signal outlets
                Object.values(nodeVariableNames.outs).map((outName) =>
                    Var('Float', outName, '0')
                ),

                // 2. Declares message receivers for all message inlets.
                Object.values(node.inlets)
                    .filter((inlet) => inlet.id in nodeVariableNames.rcvs)
                    .map((inlet) => {
                        const astFunc = nodeMessageReceivers[inlet.id]
                        if (!astFunc) {
                            throw new Error(
                                `Message receiver for inlet "${inlet.id}" of node type "${node.type}" is not implemented`
                            )
                        } else if (
                            typeof astFunc !== 'object' ||
                            astFunc.astType !== 'Func' ||
                            astFunc.args.length !== 1 ||
                            astFunc.args[0].type !== 'Message' ||
                            astFunc.returnType !== 'void'
                        ) {
                            throw new Error(
                                `receiver for inlet "${inlet.id}" of node type "${node.type}" should be have signature (m: Message): void`
                            )
                        }

                        // prettier-ignore
                        return Func(nodeVariableNames.rcvs[inlet.id], astFunc.args, 'void')`
                            ${astFunc.body}
                            throw new Error('[${node.type}], id "${node.id}", inlet "${inlet.id}", unsupported message : ' + msg_display(${astFunc.args[0].name})${
                                debug
                                    ? " + '\\nDEBUG : remember, you must return from message receiver'"
                                    : ''})
                        `
                    }),

                // 3. Custom declarations for the node
                nodeImplementation.generateDeclarations
                    ? nodeImplementation.generateDeclarations({
                          globs,
                          state: nodeVariableNames.state,
                          snds: nodePrecompilation.snds,
                          node,
                          compilation,
                      })
                    : null,
            ]
        }),

        // 4. Declares message senders for all message outlets.
        // This needs to come after all message receivers are declared since we reference them here.
        // If there are outlets listeners declared we also inject the code here.
        // Senders that don't appear in precompilation are not declared.
        graphTraversalNodes.map((node) => {
            const nodeVariableNames = variableNamesIndex.nodes[node.id]
            const nodeOutletListeners = outletListenerSpecs[node.id] || []
            return Object.values(node.outlets)
                .filter((outlet) => outlet.id in nodeVariableNames.snds)
                .map((outlet) => {
                    const hasOutletListener = nodeOutletListeners.includes(
                        outlet.id
                    )
                    const outletSinks = getters.getSinks(node, outlet.id)
                    // prettier-ignore
                    return Func(nodeVariableNames.snds[outlet.id], [
                            Var('Message', 'm')
                        ], 'void')`
                        ${[
                            hasOutletListener ? 
                                `${variableNamesIndex.outletListeners[node.id][outlet.id]}(m)` : '',
                            outletSinks.map(({ nodeId: sinkNodeId, portletId: inletId }) => 
                                `${precompilation[sinkNodeId].rcvs[inletId]}(m)`
                            )
                        ]}
                    `
                })
        }),
    ])
}
