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
import render from '../../ast/render'
import { Code, VariableName } from '../../ast/types'
import { DspGraph, getters } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { getMacros } from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../namespace'
import { IoMessageSpecs, Compilation } from '../types'
import { attachNodeVariable, attachNodeImplementationVariable } from '../variable-names-index'
import { DspGroup } from '../types'
import { isNodeInsideGroup } from './dsp-groups'

type InlinedNodes = { [nodeId: DspGraph.NodeId]: Code }
type InlinedInputs = { [inletId: DspGraph.PortletId]: Code }

const MESSAGE_RECEIVER_SIGNATURE = AnonFunc([Var('Message', 'm')], 'void')``

export const precompileState = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, variableNamesIndex } = compilation
    const { globs } = variableNamesIndex
    const precompiledNode = precompilation.nodes[node.id]
    const { nodeImplementation } = precompiledNode
    if (nodeImplementation.state) {
        const nodeType = node.type
        const stateClassName = variableNamesIndex.nodeImplementations[nodeType].stateClass
        if (!stateClassName) {
            throw new Error(
                `No stateClass defined for ${nodeType}`
            )
        }
        const astClass = nodeImplementation.state({
            globs,
            node,
            compilation,
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
    compilation: Compilation,
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const { precompilation } = compilation
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
        compilation,
        'signalOuts',
        node.id,
        outletId
    )
    precompilation.nodes[node.id].signalOuts[outletId] = signalOutName
    precompilation.nodes[node.id].generationContext.signalOuts[outletId] =
        signalOutName
    outletSinks.forEach(({ portletId: inletId, nodeId: sinkNodeId }) => {
        precompilation.nodes[sinkNodeId].generationContext.signalIns[inletId] =
            signalOutName
    })
}

export const precompileSignalInletWithNoSource = (
    compilation: Compilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const { precompilation, variableNamesIndex } = compilation
    precompilation.nodes[node.id].generationContext.signalIns[inletId] =
        variableNamesIndex.globs.nullSignal
}

export const precompileMessageOutlet = (
    compilation: Compilation,
    sourceNode: DspGraph.Node,
    outletId: DspGraph.PortletId
) => {
    const outletSinks = getters.getSinks(sourceNode, outletId)
    const {
        variableNamesIndex,
        precompilation,
        settings: { io },
    } = compilation
    const precompiledNode = precompilation.nodes[sourceNode.id]

    const ioSendersPortletIds = _getPortletIdsFromMsgIo(
        io.messageSenders,
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
                    precompilation.graph.coldDspGroups
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
            compilation,
            'messageSenders',
            sourceNode.id,
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
            compilation.variableNamesIndex.globs.nullMessageReceiver
    }
}

export const precompileMessageInlet = (
    compilation: Compilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const precompiledNode = compilation.precompilation.nodes[node.id]
    if (_getMessageInletTotalSourceCount(compilation, node, inletId) >= 1) {
        const messageReceiverName = attachNodeVariable(
            compilation,
            'messageReceivers',
            node.id,
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
        )`throw new Error("This placeholder should have been replaced during compilation")`
    } else {
        // If sourcesCount === 0, no need to declare message receiver
    }
}

/**
 * This needs to be in a separate function as `precompileMessageInlet`, because we need
 * all variable names defined before we can precompile message receivers.
 */
export const precompileMessageReceivers = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, variableNamesIndex } = compilation
    const precompiledNode = precompilation.nodes[node.id]
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
                  compilation,
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
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, variableNamesIndex } = compilation
    const { globs } = variableNamesIndex

    const precompiledNode = precompilation.nodes[node.id]
    const { state, messageSenders: snds } = precompiledNode.generationContext
    const { nodeImplementation } = precompiledNode
    precompiledNode.initialization = nodeImplementation.initialization
        ? nodeImplementation.initialization({
              globs,
              state,
              snds,
              node,
              compilation,
          })
        : ast``
}

export const precompileLoop = (
    compilation: Compilation,
    node: DspGraph.Node
) => {
    const { precompilation, variableNamesIndex } = compilation
    const precompiledNode = precompilation.nodes[node.id]
    const { globs } = variableNamesIndex
    const {
        signalOuts: outs,
        signalIns: ins,
        messageSenders: snds,
        state,
    } = precompiledNode.generationContext
    const { nodeImplementation } = precompiledNode
    const baseContext = {
        globs,
        node,
        state,
        ins,
        compilation,
    }

    // Nodes that come here might have an inlinable loop, but still can't
    // be inlined because, for example, they have 2 sinks.
    if (nodeImplementation.inlineLoop) {
        const outletId = Object.keys(node.outlets)[0]
        precompiledNode.loop = ast`${
            variableNamesIndex.nodes[node.id].signalOuts[outletId]
        } = ${nodeImplementation.inlineLoop(baseContext)}`
    } else if (nodeImplementation.loop) {
        precompiledNode.loop = nodeImplementation.loop({
            ...baseContext,
            outs,
            snds,
        })
    } else {
        throw new Error(`No loop to generate for node ${node.type}:${node.id}`)
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
export const precompileInlineLoop = (
    compilation: Compilation,
    dspGroup: DspGroup
): void => {
    const { precompilation, variableNamesIndex, graph, target } = compilation
    const { globs } = variableNamesIndex
    const inlinedNodes = dspGroup.traversal.reduce<InlinedNodes>(
        (inlinedNodes, nodeId) => {
            const precompiledNode = precompilation.nodes[nodeId]
            const { signalIns: ins, state } = precompiledNode.generationContext
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

            // TODO assemblyscript-upgrade : we need this because of a assemblyscript bug that seems
            // to be fixed in latest version. Remove when upgrading.
            // Bugs when a single variable name is surrounded with brackets : e.g. `(node1_OUTS_0)`
            // causes compilation error.
            const inlined = nodeImplementation.inlineLoop({
                globs,
                state,
                ins: createNamespace(nodeNamespaceLabel(node, 'ins'), {
                    ...ins,
                    ...inlinedInputs,
                }),
                node,
                compilation,
            })
            const needsFix =
                inlined.content.length > 1 ||
                (typeof inlined.content[0] === 'string' &&
                    inlined.content[0].includes(' '))

            if (needsFix) {
                inlined.content.unshift('(')
                inlined.content.push(')')
            }
            // END TODO
            return {
                ...inlinedNodes,
                [nodeId]: render(getMacros(target), inlined),
            }
        },
        {}
    )

    const groupSinkNode = _getInlinableGroupSinkNode(graph, dspGroup)
    precompilation.nodes[groupSinkNode.nodeId].generationContext.signalIns[
        groupSinkNode.portletId
    ] = inlinedNodes[dspGroup.outNodesIds[0]]
}

export const precompileCaching = (
    compilation: Compilation,
    node: DspGraph.Node
): void => {
    const { precompilation, variableNamesIndex } = compilation
    const precompiledNode = precompilation.nodes[node.id]
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
                  compilation,
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
    compilation: Compilation,
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
) => {
    const {
        settings: { io },
    } = compilation
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
