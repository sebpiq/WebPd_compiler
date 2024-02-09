
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
import { attachNodePortlet } from './variable-names-index'

export const precompileSignalOutlet = (
    { input, output }: Precompilation,
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
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
    const signalOutName = attachNodePortlet(
        output.variableNamesIndex,
        input.settings,
        'signalOuts',
        node,
        outletId
    )
    const precompiledNode = output.nodes[node.id]!
    precompiledNode.signalOuts[outletId] = signalOutName
    outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
        output.nodes[sinkNodeId]!.signalIns[inletId] = signalOutName
    })
}

export const precompileSignalInletWithNoSource = (
    { output }: Precompilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    output.nodes[node.id]!.signalIns[inletId] =
        output.variableNamesIndex.globs.nullSignal
}

export const precompileMessageOutlet = (
    { input: { settings }, output }: Precompilation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const { variableNamesIndex } = output
    const precompiledNode = output.nodes[sourceNode.id]!
    const sinkFunctionNames = [
        ...outletSinks.map(
            ({ nodeId: sinkNodeId, portletId: inletId }) =>
                variableNamesIndex.nodes[sinkNodeId]!.messageReceivers[inletId]!
        ),
        ...outletSinks.reduce<Array<VariableName>>(
            (coldDspFunctionNames, sink) => {
                const groupsContainingSink = Object.entries(
                    output.graph.coldDspGroups
                )
                    .filter(([_, dspGroup]) =>
                        isNodeInsideGroup(dspGroup, sink.nodeId)
                    )
                    .map(([groupId]) => groupId)

                const functionNames = groupsContainingSink.map(
                    (groupId) => variableNamesIndex.coldDspGroups[groupId]!
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
        const messageSenderName = attachNodePortlet(
            output.variableNamesIndex,
            settings,
            'messageSenders',
            sourceNode,
            outletId
        )
        precompiledNode.messageSenders[outletId] = {
            messageSenderName,
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
            messageSenderName: variableNamesIndex.globs.nullMessageReceiver,
            sinkFunctionNames: [],
        }
    }
}

export const precompileMessageInlet = (
    { input, output }: Precompilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const precompiledNode = output.nodes[node.id]!
    if (getters.getSources(node, inletId).length >= 1) {
        const messageReceiverName = attachNodePortlet(
            output.variableNamesIndex,
            input.settings,
            'messageReceivers',
            node,
            inletId
        )

        // Add a placeholder message receiver that should be substituted when
        // precompiling message receivers.
        precompiledNode.messageReceivers[inletId] = Func(
            messageReceiverName,
            [Var('Message', 'm')],
            'void'
        )`throw new Error("This placeholder should have been replaced during precompilation")`
    } else {
        // If sourcesCount === 0, no need to declare message receiver
    }
}
