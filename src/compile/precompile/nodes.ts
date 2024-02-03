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
import { assertFuncSignatureEqual } from '../../ast/ast-helpers'
import { AnonFunc, Func, Var, ast } from '../../ast/declare'
import render from '../render'
import { Code, VariableName } from '../../ast/types'
import { DspGraph, getters } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { getMacros } from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../compile-helpers'
import { IoMessageSpecs, CompilationSettings } from '../types'
import { attachNodeVariable } from './variable-names-index'
import { DspGroup, PrecompilationOperation } from './types'
import { isNodeInsideGroup } from './dsp-groups'

type InlinedNodes = { [nodeId: DspGraph.NodeId]: Code }
type InlinedInputs = { [inletId: DspGraph.PortletId]: Code }

const MESSAGE_RECEIVER_SIGNATURE = AnonFunc([Var('Message', 'm')], 'void')``

export const precompileState = (
    { input: { settings }, output }: PrecompilationOperation,
    node: DspGraph.Node
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const precompiledNode = output.nodes[node.id]
    const { nodeImplementation } = precompiledNode
    if (nodeImplementation.state) {
        const nodeType = node.type
        const stateClassName =
            variableNamesIndex.nodeImplementations[nodeType].stateClass
        if (!stateClassName) {
            throw new Error(`No stateClass defined for ${nodeType}`)
        }
        const astClass = nodeImplementation.state({
            globs,
            node,
            settings,
            stateClassName,
        })

        // Add state iniialization to the node.
        precompiledNode.state = {
            className: stateClassName,
            initialization: astClass.members.reduce(
                (stateInitialization, astVar) => ({
                    ...stateInitialization,
                    [astVar.name]: astVar.value,
                }),
                {}
            ),
        }
    }
}

export const precompileSignalOutlet = (
    { input, output }: PrecompilationOperation,
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
    const signalOutName = attachNodeVariable(
        output.variableNamesIndex,
        input.settings,
        'signalOuts',
        node,
        outletId
    )
    output.nodes[node.id].signalOuts[outletId] = signalOutName
    output.nodes[node.id].generationContext.signalOuts[outletId] = signalOutName
    outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
        output.nodes[sinkNodeId].generationContext.signalIns[inletId] =
            signalOutName
    })
}

export const precompileSignalInletWithNoSource = (
    { output }: PrecompilationOperation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    output.nodes[node.id].generationContext.signalIns[inletId] =
        output.variableNamesIndex.globs.nullSignal
}

export const precompileMessageOutlet = (
    { input: { settings }, output }: PrecompilationOperation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const { variableNamesIndex } = output
    const precompiledNode = output.nodes[sourceNode.id]

    const ioSendersPortletIds = _getPortletIdsFromMsgIo(
        settings.io.messageSenders,
        sourceNode.id
    )
    const hasIoSender = ioSendersPortletIds.includes(outletId)
    const functionNames = [
        ...outletSinks.map(
            ({ nodeId: sinkNodeId, portletId: inletId }) =>
                variableNamesIndex.nodes[sinkNodeId].messageReceivers[inletId]
        ),
        ...(hasIoSender
            ? [variableNamesIndex.io.messageSenders[sourceNode.id][outletId]]
            : []),
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
                    (groupId) => variableNamesIndex.coldDspGroups[groupId]
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
    if (functionNames.length > 1) {
        const messageSenderName = attachNodeVariable(
            output.variableNamesIndex,
            settings,
            'messageSenders',
            sourceNode,
            outletId
        )
        precompiledNode.generationContext.messageSenders[outletId] =
            messageSenderName
        precompiledNode.messageSenders[outletId] = {
            messageSenderName,
            functionNames,
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
    else if (functionNames.length === 1) {
        precompiledNode.generationContext.messageSenders[outletId] =
            functionNames[0]
    }

    // If no function to call, we assign the node SND
    // a function that does nothing
    else {
        precompiledNode.generationContext.messageSenders[outletId] =
            variableNamesIndex.globs.nullMessageReceiver
    }
}

export const precompileMessageInlet = (
    { input, output }: PrecompilationOperation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const precompiledNode = output.nodes[node.id]
    if (_getMessageInletTotalSourceCount(input.settings, node, inletId) >= 1) {
        const messageReceiverName = attachNodeVariable(
            output.variableNamesIndex,
            input.settings,
            'messageReceivers',
            node,
            inletId
        )
        precompiledNode.generationContext.messageReceivers[inletId] =
            messageReceiverName

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

/**
 * This needs to be in a separate function as `precompileMessageInlet`, because we need
 * all variable names defined before we can precompile message receivers.
 */
export const precompileMessageReceivers = (
    { input: { settings }, output }: PrecompilationOperation,
    node: DspGraph.Node
) => {
    const { variableNamesIndex } = output
    const precompiledNode = output.nodes[node.id]
    const { globs } = variableNamesIndex
    const { nodeImplementation } = precompiledNode
    const { state, messageSenders: snds } = precompiledNode.generationContext
    const messageReceivers = createNamespace(
        nodeNamespaceLabel(node, 'messageReceivers'),
        nodeImplementation.messageReceivers
            ? nodeImplementation.messageReceivers({
                  globs,
                  state,
                  snds,
                  node,
                  settings,
              })
            : {}
    )

    Object.keys(precompiledNode.messageReceivers).forEach((inletId) => {
        const implementedFunc = messageReceivers[inletId]
        assertFuncSignatureEqual(implementedFunc, MESSAGE_RECEIVER_SIGNATURE)
        const targetFunc = precompiledNode.messageReceivers[inletId]

        // We can't override values in the namespace, so we need to copy
        // the function's properties one by one.
        targetFunc.name =
            variableNamesIndex.nodes[node.id].messageReceivers[inletId]
        targetFunc.args = implementedFunc.args
        targetFunc.body = implementedFunc.body
        targetFunc.returnType = implementedFunc.returnType
    })
}

export const precompileInitialization = (
    { input: { settings }, output }: PrecompilationOperation,
    node: DspGraph.Node
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex

    const precompiledNode = output.nodes[node.id]
    const { state, messageSenders: snds } = precompiledNode.generationContext
    const { nodeImplementation } = precompiledNode
    precompiledNode.initialization = nodeImplementation.initialization
        ? nodeImplementation.initialization({
              globs,
              state,
              snds,
              node,
              settings,
          })
        : ast``
}

export const precompileDsp = (
    { input: { settings }, output }: PrecompilationOperation,
    node: DspGraph.Node
) => {
    const { variableNamesIndex } = output
    const precompiledNode = output.nodes[node.id]
    const { globs } = variableNamesIndex
    const {
        signalOuts: outs,
        signalIns: ins,
        messageSenders: snds,
        state,
    } = precompiledNode.generationContext
    const { nodeImplementation } = precompiledNode
    const context = {
        globs,
        node,
        state,
        ins,
        outs,
        snds,
        settings,
    }

    // Nodes that come here might have inlinable dsp, but still can't
    // be inlined because, for example, they have 2 sinks.
    if (nodeImplementation.flags && nodeImplementation.flags.isDspInline) {
        const outletId = Object.keys(node.outlets)[0]
        precompiledNode.dsp = ast`${
            variableNamesIndex.nodes[node.id].signalOuts[outletId]
        } = ${nodeImplementation.dsp(context)}`
    } else if (nodeImplementation.dsp) {
        precompiledNode.dsp = nodeImplementation.dsp(context)
    } else {
        throw new Error(`No dsp to generate for node ${node.type}:${node.id}`)
    }
}

/**
 * Inlines a dsp group of inlinable nodes into a single string.
 * That string is then injected as signal input to the sink of our dsp group.
 * e.g. :
 *
 * ```
 *          [  n1  ]      <-  inlinable dsp group
 *               \          /
 *    [  n2  ]  [  n3  ]  <-
 *      \        /
 *       \      /
 *        \    /
 *       [  n4  ]  <- out node for the dsp group
 *           |
 *       [  n5  ]  <- non-inlinable node, sink of the group
 *
 * ```
 */
export const precompileInlineDsp = (
    { input: { graph, settings }, output }: PrecompilationOperation,
    dspGroup: DspGroup
): void => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const inlinedNodes = dspGroup.traversal.reduce<InlinedNodes>(
        (inlinedNodes, nodeId) => {
            const precompiledNode = output.nodes[nodeId]
            const {
                signalIns: ins,
                signalOuts: outs,
                messageSenders: snds,
                state,
            } = precompiledNode.generationContext
            const { nodeImplementation } = precompiledNode
            const node = getters.getNode(graph, nodeId)
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
                            dspGroup.traversal.includes(sources[0].nodeId)
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

            return {
                ...inlinedNodes,
                [nodeId]: '(' + render(getMacros(settings.target), nodeImplementation.dsp({
                    globs,
                    state,
                    ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {
                        ...ins,
                        ...inlinedInputs,
                    }),
                    outs,
                    snds,
                    node,
                    settings,
                })) + ')',
            }
        },
        {}
    )

    const groupSinkNode = _getInlinableGroupSinkNode(graph, dspGroup)
    output.nodes[groupSinkNode.nodeId].generationContext.signalIns[
        groupSinkNode.portletId
    ] = inlinedNodes[dspGroup.outNodesIds[0]]
}

export const precompileCaching = (
    { input: { settings }, output }: PrecompilationOperation,
    node: DspGraph.Node
): void => {
    const { variableNamesIndex } = output
    const precompiledNode = output.nodes[node.id]
    const { globs } = variableNamesIndex
    const { nodeImplementation } = precompiledNode
    const { state, signalIns: ins } = precompiledNode.generationContext
    const caching = createNamespace(
        nodeNamespaceLabel(node, 'caching'),
        nodeImplementation.caching
            ? nodeImplementation.caching({
                  globs,
                  state,
                  ins,
                  node,
                  settings,
              })
            : {}
    )

    Object.entries(caching).forEach(([inletId, astElement]) => {
        // If that sink is directly connected to a cold dsp group,
        // then the caching function will be ran at the same time
        // as the cold dsp.
        //
        // Otherwise, that caching function will be ran in the same dsp
        // flow as the node.
        precompiledNode.caching[inletId] = astElement
    })
}

const _getInlinableGroupSinkNode = (
    graph: DspGraph.Graph,
    dspGroup: DspGroup
) => {
    const groupOutNode = getters.getNode(graph, dspGroup.outNodesIds[0])
    return Object.entries(groupOutNode.sinks).find(([outletId]) => {
        const outlet = getters.getOutlet(groupOutNode, outletId)
        return outlet.type === 'signal'
    })[1][0]
}

const _getMessageInletTotalSourceCount = (
    settings: CompilationSettings,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const { io } = settings
    const ioReceiversPortletIds = _getPortletIdsFromMsgIo(
        io.messageReceivers,
        node.id
    )
    const inletSources = getters.getSources(node, inletId)
    return inletSources.length + +ioReceiversPortletIds.includes(inletId)
}

const _getPortletIdsFromMsgIo = (
    specs: IoMessageSpecs,
    nodeId: DspGraph.NodeId
): Array<DspGraph.PortletId> =>
    (specs[nodeId] && specs[nodeId].portletIds) || []
