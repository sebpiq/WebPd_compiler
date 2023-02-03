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

import { DspGraph, getters } from '@webpd/dsp-graph'
import { getNodeImplementation, PrecompiledPortlets } from '../compile-helpers'
import { renderCode } from '../functional-helpers'
import { Code, Compilation } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal,
    { precompiledInlets, precompiledOutlets }: PrecompiledPortlets
): Code => {
    const {
        graph,
        macros,
        codeVariableNames,
        nodeImplementations,
        outletListenerSpecs,
        debug,
    } = compilation
    const graphTraversalNodes = graphTraversal.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )
    const { Var, Func } = macros
    const { globs } = codeVariableNames
    const sharedCode: Set<Code> = new Set()

    const _isInletAlreadyHandled = (
        nodeId: DspGraph.NodeId,
        portletId: DspGraph.PortletId
    ) => (precompiledInlets[nodeId] || []).includes(portletId)

    const _isOutletAlreadyHandled = (
        nodeId: DspGraph.NodeId,
        portletId: DspGraph.PortletId
    ) => (precompiledOutlets[nodeId] || []).includes(portletId)

    // prettier-ignore
    return renderCode`
        let ${Var(globs.iterFrame, 'Int')} = 0
        let ${Var(globs.frame, 'Int')} = 0
        let ${Var(globs.blockSize, 'Int')} = 0
        let ${Var(globs.sampleRate, 'Float')} = 0
        function ${globs.nullMessageReceiver} ${Func([Var('m', 'Message')], 'void')} {}


        ${graphTraversalNodes.map(node => {
            // 0. De-duplicate and insert shared code required by nodes
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            return nodeImplementation.sharedCode.map(codeGenerator => codeGenerator({ macros }))
                .filter(code => {
                    if (sharedCode.has(code)) {
                        return false
                    } else {
                        sharedCode.add(code)
                        return true
                    }
                })
            })
        }

        ${graphTraversalNodes.map(node => {
            const { ins, outs, rcvs, snds, state } = codeVariableNames.nodes[node.id]
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            const nodeMessageReceivers = nodeImplementation.messages({
                macros, globs, state, snds, node, compilation
            })

            return [
                // 1. Declares signal inlets and outlets
                Object.values(node.inlets)
                    .filter(inlet => inlet.type === 'signal')
                    .filter(inlet => !_isInletAlreadyHandled(node.id, inlet.id))
                    .map(inlet => `let ${Var(ins[inlet.id], 'Float')} = 0`),
                
                Object.values(node.outlets)
                    .filter(outlet => outlet.type === 'signal')
                    .filter(outlet => !_isOutletAlreadyHandled(node.id, outlet.id))
                    .map(outlet => `let ${Var(outs[outlet.id], 'Float')} = 0`),

                // 2. Declares message receivers for all message inlets.
                Object.values(node.inlets)
                    .filter(inlet => inlet.type === 'message')
                    .filter(inlet => !_isInletAlreadyHandled(node.id, inlet.id))
                    // prettier-ignore
                    .map(inlet => {
                        if (typeof nodeMessageReceivers[inlet.id] !== 'string') {
                            throw new Error(`Message receiver for inlet "${inlet.id}" of node type "${node.type}" is not implemented`)
                        }
                        return `
                            function ${rcvs[inlet.id]} ${Func([
                                Var(globs.m, 'Message')
                            ], 'void')} {
                                ${nodeMessageReceivers[inlet.id]}
                                throw new Error('[${node.type}], id "${node.id}", inlet "${inlet.id}", unsupported message : ' + msg_display(${globs.m})${
                                    debug ? " + '\\nDEBUG : remember, you must return from message receiver'": ''})
                            }
                        `}),

                // 3. Custom declarations for the node
                nodeImplementation.declare({
                    macros, globs, state, node, compilation
                }),
            ]
        })}

        ${  // 4. Declares message senders for all message outlets.
            // This needs to come after all message receivers are declared since we reference them here.
            // If there are outlets listeners declared we also inject the code here.
            graphTraversalNodes.map(node => {
                const { snds } = codeVariableNames.nodes[node.id]
                const nodeOutletListeners = outletListenerSpecs[node.id] || []
                return Object.values(node.outlets)
                    .filter(outlet => outlet.type === 'message')
                    .filter(outlet => !_isOutletAlreadyHandled(node.id, outlet.id))
                    .map(outlet => {
                        const hasOutletListener = nodeOutletListeners.includes(outlet.id)
                        const outletSinks = getters.getSinks(node, outlet.id)
                        return renderCode`
                            function ${snds[outlet.id]} ${Func([
                                Var('m', 'Message')
                            ], 'void')} {
                                ${[
                                    hasOutletListener ? 
                                        `${codeVariableNames.outletListeners[node.id][outlet.id]}(${globs.m})` : '',
                                    outletSinks.map(({ nodeId: sinkNodeId, portletId: inletId }) => 
                                        `${codeVariableNames.nodes[sinkNodeId].rcvs[inletId]}(${globs.m})`
                                    )
                                ]}
                            }
                        `
                    })
            })}
    `
}
