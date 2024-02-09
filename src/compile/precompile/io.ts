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
import {
    CompilationSettings,
    NodeImplementation,
    NodeImplementations,
} from '../types'
import { helpers } from '../../dsp-graph'
import { VariableNamesIndex } from './types'

const MESSAGE_RECEIVER_NODE_TYPE = '_messageReceiver'

// See `/render/templates.ioMessageReceivers` to see how this works.
const messageReceiverNodeImplementation: NodeImplementation = {}

const MESSAGE_SENDER_NODE_TYPE = '_messageSender'

interface MessageSenderNodeArgs {
    messageSenderName: string
}

const messageSenderNodeImplementation: NodeImplementation<MessageSenderNodeArgs> =
    {
        messageReceivers: ({ node: { args } }) => ({
            // prettier-ignore
            '0': AnonFunc([
                Var('Message', 'm')
            ])`
                ${args.messageSenderName}(m)
                return
            `,
        }),
    }

export const addNodeImplementationsForMessageIo = (
    nodeImplementations: NodeImplementations
): NodeImplementations => {
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
    return {
        ...nodeImplementations,
        _messageReceiver: messageReceiverNodeImplementation,
        _messageSender: messageSenderNodeImplementation,
    }
}

export const addGraphNodesForMessageIo = (
    graph: DspGraph.Graph,
    settings: CompilationSettings,
    variableNamesIndex: VariableNamesIndex
): DspGraph.Graph => {
    const graphWithIoNodes = { ...graph }
    Object.entries(settings.io.messageReceivers).forEach(
        ([specNodeId, spec]) => {
            spec.portletIds.forEach((specPortletId) => {
                const nodeId =
                    variableNamesIndex.io.messageReceivers[specNodeId]![
                        specPortletId
                    ]!.nodeId
                const messageReceiverNode: DspGraph.Node = {
                    ...helpers.nodeDefaults(nodeId, MESSAGE_RECEIVER_NODE_TYPE),
                    // To force the node to be included in the traversal
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                }
                mutators.addNode(graphWithIoNodes, messageReceiverNode)
                mutators.connect(
                    graphWithIoNodes,
                    { nodeId, portletId: '0' },
                    { nodeId: specNodeId, portletId: specPortletId }
                )
            })
        }
    )
    Object.entries(settings.io.messageSenders).forEach(([specNodeId, spec]) => {
        spec.portletIds.forEach((specPortletId) => {
            const { funcName, nodeId } =
                variableNamesIndex.io.messageSenders[specNodeId]![
                    specPortletId
                ]!
            const messageSenderNode: DspGraph.Node<MessageSenderNodeArgs> = {
                ...helpers.nodeDefaults(nodeId, MESSAGE_SENDER_NODE_TYPE),
                args: {
                    messageSenderName: funcName,
                },
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            }
            mutators.addNode(graphWithIoNodes, messageSenderNode)
            mutators.connect(
                graphWithIoNodes,
                { nodeId: specNodeId, portletId: specPortletId },
                { nodeId, portletId: '0' }
            )
        })
    })

    return graphWithIoNodes
}
