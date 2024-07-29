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
import { Func, Var } from '../../ast/declare'
import { VariableName } from '../../ast/types'
import { DspGraph, getters } from '../../dsp-graph'
import { isNodeInsideGroup } from './dsp-groups'
import { Precompilation } from './types'

export const precompileSignalOutlet = (
    precompilation: Precompilation,
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const { variableNamesAssigner, precompiledCodeAssigner } = precompilation
    const outletSinks = getters.getSinks(node, outletId)

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
    const signalOutName =
        variableNamesAssigner.nodes[node.id]!.signalOuts[outletId]!
    precompiledCodeAssigner.nodes[node.id]!.signalOuts[outletId] = signalOutName
    outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
        precompiledCodeAssigner.nodes[sinkNodeId]!.signalIns[inletId] =
            signalOutName
    })
}

export const precompileSignalInletWithNoSource = (
    { variableNamesAssigner, precompiledCodeAssigner }: Precompilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    precompiledCodeAssigner.nodes[node.id]!.signalIns[inletId] =
        variableNamesAssigner.globals.core!.NULL_SIGNAL!
}

export const precompileMessageOutlet = (
    { variableNamesAssigner, precompiledCodeAssigner }: Precompilation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const precompiledNode = precompiledCodeAssigner.nodes[sourceNode.id]!
    const sinkFunctionNames = [
        ...outletSinks.map(
            ({ nodeId: sinkNodeId, portletId: inletId }) =>
                variableNamesAssigner.nodes[sinkNodeId]!.messageReceivers[
                    inletId
                ]!
        ),
        ...outletSinks.reduce<Array<VariableName>>(
            (coldDspFunctionNames, sink) => {
                const groupsContainingSink = Object.entries(
                    precompiledCodeAssigner.graph.coldDspGroups
                )
                    .filter(([_, { dspGroup }]) =>
                        isNodeInsideGroup(dspGroup, sink.nodeId)
                    )
                    .map(([groupId]) => groupId)

                const functionNames = groupsContainingSink.map(
                    (groupId) => variableNamesAssigner.coldDspGroups[groupId]!
                )
                return [...coldDspFunctionNames, ...functionNames]
            },
            []
        ),
    ]

    // If there are several functions to call, we then need to generate
    // a message sender function to call all these functions, e.g. :
    //
    //      const NODE1_SND = (m) => {
    //          NODE3_RCV(m)
    //          NODE2_RCV(m)
    //      }
    //
    if (sinkFunctionNames.length > 1) {
        precompiledNode.messageSenders[outletId] = {
            messageSenderName:
                variableNamesAssigner.nodes[sourceNode.id]!.messageSenders[
                    outletId
                ]!,
            sinkFunctionNames,
        }
    }

    // For a message outlet that sends to a single function,
    // its SND can be directly replaced by that function, instead
    // of creating a dedicated message sender.
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
    else if (sinkFunctionNames.length === 1) {
        precompiledNode.messageSenders[outletId] = {
            messageSenderName: sinkFunctionNames[0]!,
            sinkFunctionNames: [],
        }
    }

    // If no function to call, we assign the node SND
    // a function that does nothing
    else {
        precompiledNode.messageSenders[outletId] = {
            messageSenderName: variableNamesAssigner.globals.msg!.nullMessageReceiver!,
            sinkFunctionNames: [],
        }
    }
}

export const precompileMessageInlet = (
    { variableNamesAssigner, precompiledCodeAssigner }: Precompilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
    const globals = variableNamesAssigner.globals
    if (getters.getSources(node, inletId).length >= 1) {
        const messageReceiverName =
            variableNamesAssigner.nodes[node.id]!.messageReceivers[inletId]!

        // Add a placeholder message receiver that should be substituted when
        // precompiling message receivers.
        precompiledNode.messageReceivers[inletId] = Func(
            messageReceiverName,
            [Var(globals.msg!.Message!, 'm')],
            'void'
        )`throw new Error("This placeholder should have been replaced during precompilation")`
    } else {
        // If sourcesCount === 0, no need to declare message receiver
    }
}
