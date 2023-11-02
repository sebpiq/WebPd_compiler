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
import { renderCode } from '../functional-helpers'
import { Code, Compilation } from './types'

export default (compilation: Compilation): Code => {
    const {
        graph,
        graphTraversalDeclare,
        macros,
        codeVariableNames,
        nodeImplementations,
        outletListenerSpecs,
        precompilation,
        debug,
    } = compilation
    const graphTraversalNodes = graphTraversalDeclare.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )
    const { Var, Func } = macros
    const { globs } = codeVariableNames

    // prettier-ignore
    return renderCode`
        ${graphTraversalNodes.map(node => {
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            const nodeVariableNames = codeVariableNames.nodes[node.id]
            const nodePrecompilation = precompilation[node.id]
            const nodeMessageReceivers =
                nodeImplementation.generateMessageReceivers({
                    macros,
                    globs,
                    state: nodeVariableNames.state,
                    snds: nodePrecompilation.snds,
                    node,
                    compilation,
                })

            return [
                // 1. Declares signal outlets
                Object.values(nodeVariableNames.outs).map(
                    (outName) => `let ${Var(outName, 'Float')} = 0`
                ),

                // 2. Declares message receivers for all message inlets.
                Object.values(node.inlets)
                    .filter((inlet) => inlet.id in nodeVariableNames.rcvs)
                    .map((inlet) => {
                        if (
                            typeof nodeMessageReceivers[inlet.id] !== 'string'
                        ) {
                            throw new Error(
                                `Message receiver for inlet "${inlet.id}" of node type "${node.type}" is not implemented`
                            )
                        }
                        // prettier-ignore
                        return `
                            function ${nodeVariableNames.rcvs[inlet.id]} ${Func([
                                Var(globs.m, 'Message')
                            ], 'void')} {
                                ${nodeMessageReceivers[inlet.id]}
                                throw new Error('[${node.type}], id "${node.id}", inlet "${inlet.id}", unsupported message : ' + msg_display(${globs.m})${
                                    debug
                                        ? " + '\\nDEBUG : remember, you must return from message receiver'"
                                        : ''})
                            }
                        `
                    }),

                // 3. Custom declarations for the node
                nodeImplementation.generateDeclarations({
                    macros,
                    globs,
                    state: nodeVariableNames.state,
                    snds: nodePrecompilation.snds,
                    node,
                    compilation,
                }),
            ]
        })}

        ${  // 4. Declares message senders for all message outlets.
            // This needs to come after all message receivers are declared since we reference them here.
            // If there are outlets listeners declared we also inject the code here.
            // Senders that don't appear in precompilation are not declared.
            graphTraversalNodes.map(node => {
                const nodeVariableNames = codeVariableNames.nodes[node.id]
                const nodeOutletListeners = outletListenerSpecs[node.id] || []
                return Object.values(node.outlets)
                    .filter(outlet => outlet.id in nodeVariableNames.snds)
                    .map(outlet => {
                        const hasOutletListener = nodeOutletListeners.includes(outlet.id)
                        const outletSinks = getters.getSinks(node, outlet.id)
                        // prettier-ignore
                        return renderCode`
                            function ${nodeVariableNames.snds[outlet.id]} ${Func([
                                Var('m', 'Message')
                            ], 'void')} {
                                ${[
                                    hasOutletListener ? 
                                        `${codeVariableNames.outletListeners[node.id][outlet.id]}(${globs.m})` : '',
                                    outletSinks.map(({ nodeId: sinkNodeId, portletId: inletId }) => 
                                        `${precompilation[sinkNodeId].rcvs[inletId]}(${globs.m})`
                                    )
                                ]}
                            }
                        `
                    })
            })}
    `
}
