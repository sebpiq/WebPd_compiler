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

import { DspGraph, getters, traversal } from '@webpd/dsp-graph'
import { getNodeImplementation, renderCode } from '../compile-helpers'
import { Code, Compilation, NodeCodeGenerator } from '../types'

export default (
    compilation: Compilation,
    graphTraversal: DspGraph.GraphTraversal
): Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    const { macros, engineVariableNames, nodeImplementations, outletListenerSpecs } = compilation
    const { g: globs, types } = engineVariableNames
    // prettier-ignore
    return renderCode`
        let ${macros.typedVar(globs.iterFrame, 'Int')}
        let ${macros.typedVar(globs.iterOutlet, 'Int')}
        let ${macros.typedVar(globs.frame, 'Int')}
        let ${macros.typedVar(globs.blockSize, 'Int')}
        let ${macros.typedVar(globs.sampleRate, 'Float')}
        const ${macros.typedVar(globs.arrays, 'Map<string,FloatArray>')} = new Map()

        ${graphTraversal.map(node => {
            const nodeVariableNames = engineVariableNames.n[node.id]
            const { ins, outs, rcvs } = nodeVariableNames
            const nodeCodeGeneratorArgs: Parameters<NodeCodeGenerator<any>> = [
                node,
                {
                    ...engineVariableNames.n[node.id],
                    globs,
                    types,
                    macros,
                },
                compilation
            ]
            const nodeImplementation = getNodeImplementation(nodeImplementations, node.type)
            const nodeDeclare = nodeImplementation.declare
            const nodeMessageReceivers = nodeImplementation.messageReceivers ? 
                nodeImplementation.messageReceivers(...nodeCodeGeneratorArgs): {}

            return [
                // 1. Declares signal inlets and outlets
                Object.values(node.inlets)
                    .filter(inlet => inlet.type === 'signal')
                    .map(inlet => `let ${macros.typedVar(ins[inlet.id], 'Float')} = 0`),
                
                Object.values(node.outlets)
                    .filter(outlet => outlet.type === 'signal')
                    .map(outlet => `let ${macros.typedVar(outs[outlet.id], 'Float')} = 0`),

                // 2. Declares message receivers for all message inlets.
                Object.values(node.inlets)
                    .filter(inlet => {
                        if (inlet.type !== 'message') {
                            return false
                        }
                        if (!nodeMessageReceivers[inlet.id]) {
                            throw new Error(`Message receiver for inlet "${inlet.id}" of node type "${node.type}" is not implemented`)
                        }
                        return true
                    })
                    .map(inlet => `
                        const ${rcvs[inlet.id]} = ${macros.typedFuncHeader([
                            macros.typedVar(globs.inMessage, 'Message')
                        ], 'void')} => {
                            ${nodeMessageReceivers[inlet.id]}
                        }
                    `),
                
                nodeDeclare ? nodeDeclare(...nodeCodeGeneratorArgs): '',
            ]
        })}

        ${  // 3. Declares message senders for all message outlets.
            // This needs to come after all message receivers are declared since we reference them here.
            // If there are outlets listeners declared we also inject the code here.
            graphTraversal.map(node => {
                const { snds } = engineVariableNames.n[node.id]
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
                            return `const ${snds[outlet.id]} = ${engineVariableNames.n[sinkNodeId].rcvs[inletId]}`
                        
                        // If we send to several sinks, we need to declare a proxy function that sends to all
                        // all the sinks when called.
                        } else {
                            return renderCode`
                                const ${snds[outlet.id]} = ${macros.typedFuncHeader([
                                    macros.typedVar('m', 'Message')
                                ], 'void')} => {
                                    ${hasOutletListener ? 
                                        `${engineVariableNames.outletListeners[node.id][outlet.id]}(${globs.inMessage})` : ''}
                                    ${outletSinks.map(({ nodeId: sinkNodeId, portletId: inletId }) => 
                                        `${engineVariableNames.n[sinkNodeId].rcvs[inletId]}(${globs.inMessage})`
                                    )}
                                }
                            `
                        }
                    })
            })}
    `
}
