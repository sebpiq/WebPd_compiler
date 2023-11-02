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

import { DspGraph, getters } from '../dsp-graph'
import { mapObject } from '../functional-helpers'
import * as variableNames from './code-variable-names'
import { createNamespace } from './namespace'
import { Compilation, Precompilation } from './types'

export const initializePrecompilation = (
    graph: DspGraph.Graph
): Precompilation =>
    createNamespace(
        'precompilation',
        mapObject(graph, (node) => {
            const namespaceLabel = `[${node.type}] ${node.id}`
            return createNamespace(namespaceLabel, {
                rcvs: createNamespace(`${namespaceLabel}.rcvs`, {}),
                outs: createNamespace(`${namespaceLabel}.outs`, {}),
                snds: createNamespace(`${namespaceLabel}.snds`, {}),
                ins: createNamespace(`${namespaceLabel}.ins`, {}),
            })
        })
    )

export default (compilation: Compilation) => {
    const {
        graph,
        graphTraversalDeclare,
        codeVariableNames,
        precompilation,
        inletCallerSpecs,
        outletListenerSpecs,
    } = compilation

    const graphTraversalNodes = graphTraversalDeclare.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )

    variableNames.attachInletCallers(compilation)
    variableNames.attachOutletListeners(compilation)

    graphTraversalNodes.forEach((node) => {
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            const sourceNode = node
            const outletSinks = getters.getSinks(sourceNode, outletId)

            // Signal inlets can receive input from ONLY ONE signal.
            // Therefore, we substitute inlet variable directly with
            // previous node's outs. e.g. instead of :
            //
            //      NODE2_IN = NODE1_OUT
            //      NODE2_OUT = NODE2_IN * 2
            //
            // we will have :
            //
            //      NODE2_OUT = NODE1_OUT * 2
            //
            if (outlet.type === 'signal') {
                const outName = variableNames.attachNodeVariable(
                    compilation,
                    'outs',
                    sourceNode.id,
                    outletId
                )
                outletSinks.forEach(
                    ({ portletId: inletId, nodeId: sinkNodeId }) => {
                        precompilation[sinkNodeId].ins[inletId] = outName
                    }
                )

                // For a message outlet that sends to a single sink node
                // its out can be directly replaced by next node's in.
                // e.g. instead of (which is useful if several sinks) :
                //
                //      const NODE1_SND = (m) => {
                //          NODE2_RCV(m)
                //      }
                //      // ...
                //      NODE1_SND(m)
                //
                // we can directly substitute NODE1_SND by NODE2_RCV :
                //
                //      NODE2_RCV(m)
                //
            } else if (outlet.type === 'message') {
                const nodeOutletListenerSpecs =
                    outletListenerSpecs[sourceNode.id] || []
                if (
                    outletSinks.length === 1 &&
                    !nodeOutletListenerSpecs.includes(outletId)
                ) {
                    const rcvName = variableNames.attachNodeVariable(
                        compilation,
                        'rcvs',
                        outletSinks[0].nodeId,
                        outletSinks[0].portletId
                    )
                    precompilation[sourceNode.id].snds[outletId] = rcvName

                    // Same thing if there's no sink, but one outlet listener
                } else if (
                    outletSinks.length === 0 &&
                    nodeOutletListenerSpecs.includes(outletId)
                ) {
                    precompilation[sourceNode.id].snds[outletId] =
                        codeVariableNames.outletListeners[sourceNode.id][
                            outletId
                        ]

                    // If no sink, no message receiver, we assign the node SND
                    // a function that does nothing
                } else if (
                    outletSinks.length === 0 &&
                    !nodeOutletListenerSpecs.includes(outletId)
                ) {
                    precompilation[sourceNode.id].snds[outletId] =
                        compilation.codeVariableNames.globs.nullMessageReceiver

                    // Otherwise, there are several sinks, we then need to generate
                    // a function to send messages to all sinks, e.g. :
                    //
                    //      const NODE1_SND = (m) => {
                    //          NODE3_RCV(m)
                    //          NODE2_RCV(m)
                    //      }
                    //
                } else {
                    variableNames.attachNodeVariable(
                        compilation,
                        'snds',
                        sourceNode.id,
                        outletId
                    )
                }
            }
        })

        Object.entries(node.inlets).forEach(([inletId, inlet]) => {
            const sinkNode = node
            const nodeInletCallerSpecs = inletCallerSpecs[sinkNode.id] || []
            const inletSources = getters.getSources(sinkNode, inletId)

            if (inlet.type === 'message') {
                // If message inlet has at least one source, or no source but an inlet caller,
                // we need to declare the receiver.
                if (
                    (inletSources.length === 0 &&
                        nodeInletCallerSpecs.includes(inlet.id)) ||
                    inletSources.length > 0
                ) {
                    variableNames.attachNodeVariable(
                        compilation,
                        'rcvs',
                        sinkNode.id,
                        inletId
                    )
                } else {
                    // No need to declare rcv if no inlet caller
                }
            } else if (
                inlet.type === 'signal' &&
                getters.getSources(sinkNode, inletId).length === 0
            ) {
                // If signal inlet has no source, we assign it a constant value of 0.
                precompilation[sinkNode.id].ins[inletId] =
                    codeVariableNames.globs.nullSignal
            }
        })
    })

    // Copy code variable names over to precompilation object.
    Object.entries(codeVariableNames.nodes).forEach(
        ([nodeId, nodeVariableNames]) => {
            ;(['outs', 'snds', 'rcvs'] as const).forEach((ns) => {
                Object.keys(nodeVariableNames[ns]).forEach((portletId) => {
                    if (!(portletId in precompilation[nodeId][ns])) {
                        precompilation[nodeId][ns][portletId] =
                            nodeVariableNames[ns][portletId]
                    }
                })
            })
        }
    )
}
