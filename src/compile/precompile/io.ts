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
import { AnonFunc, Var } from '../../ast/declare'
import { DspGraph, mutators } from '../../dsp-graph'
import { NodeImplementation, NodeImplementations } from '../types'
import { helpers } from '../../dsp-graph'
import { Precompilation } from './types'
import { VariableName } from '../../ast/types'

const MESSAGE_RECEIVER_NODE_TYPE = '_messageReceiver'

// See `/render/templates.ioMessageReceivers` to see how this works.
const messageReceiverNodeImplementation: NodeImplementation = {}

const MESSAGE_SENDER_NODE_TYPE = '_messageSender'

interface MessageSenderNodeArgs {
    messageSenderName: VariableName
}

const messageSenderNodeImplementation: NodeImplementation<MessageSenderNodeArgs> =
    {
        messageReceivers: ({ node: { args } }, { globals }) => ({
            // prettier-ignore
            '0': AnonFunc([
                Var(globals.msg!.Message!, 'm')
            ])`
                ${args.messageSenderName}(m)
                return
            `,
        }),
    }

export const addNodeImplementationsForMessageIo = (
    nodeImplementations: NodeImplementations
) => {
    if (nodeImplementations[MESSAGE_RECEIVER_NODE_TYPE]) {
        throw new Error(
            `Reserved node type '${MESSAGE_RECEIVER_NODE_TYPE}' already exists. Please use a different name.`
        )
    }
    if (nodeImplementations[MESSAGE_SENDER_NODE_TYPE]) {
        throw new Error(
            `Reserved node type '${MESSAGE_SENDER_NODE_TYPE}' already exists. Please use a different name.`
        )
    }
    nodeImplementations[MESSAGE_RECEIVER_NODE_TYPE] =
        messageReceiverNodeImplementation
    nodeImplementations[MESSAGE_SENDER_NODE_TYPE] =
        messageSenderNodeImplementation
}

export const precompileIoMessageReceiver = (
    {
        precompiledCode,
        graph,
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    specNodeId: DspGraph.NodeId,
    specInletId: DspGraph.PortletId
) => {
    const nodeId = _getNodeId(graph, 'messageReceiver', specNodeId, specInletId)
    const messageReceiverNode: DspGraph.Node = {
        ...helpers.nodeDefaults(nodeId, MESSAGE_RECEIVER_NODE_TYPE),
        // To force the node to be included in the traversal
        isPushingMessages: true,
        outlets: {
            '0': { id: '0', type: 'message' },
        },
    }
    mutators.addNode(graph, messageReceiverNode)
    mutators.connect(
        graph,
        { nodeId, portletId: '0' },
        { nodeId: specNodeId, portletId: specInletId }
    )

    precompiledCodeAssigner.io.messageReceivers[specNodeId]![specInletId] = {
        functionName:
            variableNamesAssigner.io.messageReceivers[specNodeId]![
                specInletId
            ]!,
        // When a message is received from outside of the engine, we proxy it by
        // calling our dummy node's messageSender function on outlet 0, so
        // the message is injected in the graph as a normal message would.
        getSinkFunctionName: () =>
            precompiledCode.nodes[nodeId]!.messageSenders['0']!
                .messageSenderName,
    }
}

export const precompileIoMessageSender = (
    { graph, variableNamesAssigner, precompiledCodeAssigner }: Precompilation,
    specNodeId: DspGraph.NodeId,
    specOutletId: DspGraph.PortletId
) => {
    const nodeId = _getNodeId(graph, 'messageSender', specNodeId, specOutletId)
    const messageSenderName =
        variableNamesAssigner.io.messageSenders[specNodeId]![specOutletId]!
    const messageSenderNode: DspGraph.Node<MessageSenderNodeArgs> = {
        ...helpers.nodeDefaults(nodeId, MESSAGE_SENDER_NODE_TYPE),
        args: {
            messageSenderName,
        },
        inlets: {
            '0': { id: '0', type: 'message' },
        },
    }
    mutators.addNode(graph, messageSenderNode)
    mutators.connect(
        graph,
        { nodeId: specNodeId, portletId: specOutletId },
        { nodeId, portletId: '0' }
    )

    precompiledCodeAssigner.io.messageSenders[specNodeId]![specOutletId] = {
        functionName: messageSenderName,
    }
}

// TODO : move to node id assignment function todo-node-ids
const _getNodeId = (
    graph: DspGraph.Graph,
    ns: 'messageReceiver' | 'messageSender',
    specNodeId: DspGraph.NodeId,
    specPortletId: DspGraph.PortletId
) => {
    const nodeId = `n_io${
        ns === 'messageReceiver' ? 'Rcv' : 'Snd'
    }_${specNodeId}_${specPortletId}`
    if (graph[nodeId]) {
        throw new Error(`Node id ${nodeId} already exists in graph`)
    }
    return nodeId
}
