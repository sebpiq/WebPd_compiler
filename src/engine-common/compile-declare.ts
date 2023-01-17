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

import { DspGraph, traversal } from '@webpd/dsp-graph'
import { getNodeImplementation, renderCode } from '../compile-helpers'
import { Code, Compilation } from '../types'
import { compileEventArraysChanged } from './compile-events'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const {
        macros,
        codeVariableNames,
        nodeImplementations,
        outletListenerSpecs,
        inletCallerSpecs,
    } = compilation
    const { Var, Func } = macros
    const { globs } = codeVariableNames
    const sharedCode: Set<Code> = new Set()
    // prettier-ignore
    return renderCode`
        let ${Var(globs.iterFrame, 'Int')}
        let ${Var(globs.frame, 'Int')}
        let ${Var(globs.blockSize, 'Int')}
        let ${Var(globs.sampleRate, 'Float')}
        
        function _events_ArraysChanged ${Func([], 'void')} {
            ${compileEventArraysChanged(compilation, graphTraversal)}
        }

        ${graphTraversal.map(node => {
            // 0. De-duplicate and insert shared code required by nodes
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            return nodeImplementation.sharedCode({ macros, globs, compilation })
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

        ${graphTraversal.map(node => {
            const { ins, outs, rcvs, snds, state } = codeVariableNames.nodes[node.id]
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            const nodeMessageReceivers = nodeImplementation.messages({
                macros, globs, state, snds, node, compilation
            })
            const nodeInletCallers = inletCallerSpecs[node.id] || []

            return [
                // 1. Declares signal inlets and outlets
                Object.values(node.inlets)
                    .filter(inlet => inlet.type === 'signal')
                    .map(inlet => `let ${Var(ins[inlet.id], 'Float')} = 0`),
                
                Object.values(node.outlets)
                    .filter(outlet => outlet.type === 'signal')
                    .map(outlet => `let ${Var(outs[outlet.id], 'Float')} = 0`),

                // 2. Declares message receivers for all message inlets.
                Object.values(node.inlets)
                    .filter(inlet => {
                        if (inlet.type !== 'message') {
                            return false
                        }
                        if (typeof nodeMessageReceivers[inlet.id] !== 'string') {
                            throw new Error(`Message receiver for inlet "${inlet.id}" of node type "${node.type}" is not implemented`)
                        }
                        return true
                    })
                    .map(inlet => `
                        function ${rcvs[inlet.id]} ${macros.Func([
                            Var(globs.m, 'Message')
                        ], 'void')} {
                            ${nodeMessageReceivers[inlet.id]}
                        }
                    `),
                
                // 3. Declares inlet callers
                // Here not possible to assign directly the receiver because otherwise assemblyscript
                // doesn't export a function but a global instead.
                nodeInletCallers.map(inletId => 
                    `function ${codeVariableNames.inletCallers[node.id][inletId]} ${macros.Func([
                        Var('m', 'Message')
                    ], 'void')} {${rcvs[inletId]}(m)}`
                ),

                // 4. Custom declarations for the node
                nodeImplementation.declare({
                    macros, globs, state, node, compilation
                }),
            ]
        })}

        ${  // 6. Declares message senders for all message outlets.
            // This needs to come after all message receivers are declared since we reference them here.
            // If there are outlets listeners declared we also inject the code here.
            graphTraversal.map(node => {
                const { snds } = codeVariableNames.nodes[node.id]
                const nodeOutletListeners = outletListenerSpecs[node.id] || []
                const nodeSinks = traversal.removeDeadSinks(node.sinks, traversalNodeIds)
                return Object.values(node.outlets)
                    .filter(outlet => outlet.type === 'message')
                    .map(outlet => {
                        const hasOutletListener = nodeOutletListeners.includes(outlet.id)
                        const outletSinks = nodeSinks[outlet.id] || []

                        // If we send to only a single sink, we directly assign the sink's message receiver.
                        if (outletSinks.length === 1 && !hasOutletListener) {
                            const {nodeId: sinkNodeId, portletId: inletId} = outletSinks[0]
                            return `const ${snds[outlet.id]} = ${codeVariableNames.nodes[sinkNodeId].rcvs[inletId]}`
                        
                        // If we send to several sinks, we need to declare a proxy function that sends to all
                        // all the sinks when called.
                        } else {
                            return renderCode`
                                function ${snds[outlet.id]} ${macros.Func([
                                    Var('m', 'Message')
                                ], 'void')} {
                                    ${hasOutletListener ? 
                                        `${codeVariableNames.outletListeners[node.id][outlet.id]}(${globs.m})` : ''}
                                    ${outletSinks.map(({ nodeId: sinkNodeId, portletId: inletId }) => 
                                        `${codeVariableNames.nodes[sinkNodeId].rcvs[inletId]}(${globs.m})`
                                    )}
                                }
                            `
                        }
                    })
            })}
    `
}
