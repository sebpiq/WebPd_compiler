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

import { DspGraph, getters } from '../../dsp-graph'
import { getNodeImplementationsUsedInGraph } from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../compile-helpers'
import {
    CompilationSettings,
    NodeImplementation,
    NodeImplementations,
} from '../types'
import { VariableNamesIndex } from './types'

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 *
 * @param nodeImplementations
 * @param graph
 * @returns
 */
export const generateVariableNamesIndex = (): VariableNamesIndex =>
    createNamespace('variableNamesIndex', {
        nodes: createNamespace('nodes', {}),
        nodeImplementations: createNamespace('nodeImplementations', {}),
        globs: generateVariableNamesGlobs(),
        io: {
            messageReceivers: createNamespace('io:messageReceivers', {}),
            messageSenders: createNamespace('io:messageSenders', {}),
        },
        coldDspGroups: createNamespace('coldDspGroups', {}),
    })

export const generateVariableNamesGlobs = () =>
    createNamespace('globs', {
        iterFrame: 'F',
        frame: 'FRAME',
        blockSize: 'BLOCK_SIZE',
        sampleRate: 'SAMPLE_RATE',
        output: 'OUTPUT',
        input: 'INPUT',
        nullMessageReceiver: 'SND_TO_NULL',
        nullSignal: 'NULL_SIGNAL',
        emptyMessage: 'EMPTY_MESSAGE',
    })

export const attachNodesNamespaces = (
    variableNamesIndex: VariableNamesIndex,
    graph: DspGraph.Graph
) => {
    Object.values(graph).forEach((node) => {
        variableNamesIndex.nodes[node.id] = {
            // No need for `ins` here, as signal inlets will always directly be assigned
            // the outlet from their source node.
            messageReceivers: createNamespace(
                nodeNamespaceLabel(node, 'messageReceivers'),
                {}
            ),
            messageSenders: createNamespace(
                nodeNamespaceLabel(node, 'messageSenders'),
                {}
            ),
            signalOuts: createNamespace(
                nodeNamespaceLabel(node, 'signalOuts'),
                {}
            ),
            state: null,
        }
    })
}

export const attachNodeImplementationsNamespaces = (
    variableNamesIndex: VariableNamesIndex,
    nodeImplementations: NodeImplementations,
    graph: DspGraph.Graph
) => {
    Object.keys(
        getNodeImplementationsUsedInGraph(graph, nodeImplementations)
    ).forEach((nodeType) => {
        variableNamesIndex.nodeImplementations[nodeType] = {
            stateClass: null
        }
    })
}

export const attachNodePortlet = (
    variableNamesIndex: VariableNamesIndex,
    settings: CompilationSettings,
    nsKey: 'signalOuts' | 'messageSenders' | 'messageReceivers',
    node: DspGraph.Node,
    portletId: DspGraph.PortletId
) => {
    const nodeVariableNames = variableNamesIndex.nodes[node.id]!
    const prefix = _namePrefix(settings.debug, node)
    // Shouldnt throw an error if the variable already exists, as precompile might try to
    // declare it several times.
    if (!(portletId in nodeVariableNames[nsKey])) {
        nodeVariableNames[nsKey][portletId] = {
            signalOuts: `${prefix}_OUTS_${_v(portletId)}`,
            messageSenders: `${prefix}_SNDS_${_v(portletId)}`,
            messageReceivers: `${prefix}_RCVS_${_v(portletId)}`,
        }[nsKey]
    }
    return nodeVariableNames[nsKey][portletId]!
}

export const attachNodeState = (
    variableNamesIndex: VariableNamesIndex,
    settings: CompilationSettings,
    node: DspGraph.Node,
) => {
    const stateInstanceName = `${_namePrefix(settings.debug, node)}_STATE`
    variableNamesIndex.nodes[node.id]!.state = stateInstanceName
    return stateInstanceName
}

/**
 * Helper that attaches to the generated `variableNamesIndex` the names of specified outlet listeners
 * and inlet callers.
 */
export const attachIoMessageSendersAndReceivers = (
    variableNamesIndex: VariableNamesIndex,
    settings: CompilationSettings,
    graph: DspGraph.Graph
): void =>
    (['messageReceivers', 'messageSenders'] as const).forEach((nsKey) => {
        const specs =
            (nsKey === 'messageReceivers'
                ? settings.io.messageReceivers
                : settings.io.messageSenders) || {}
        Object.entries(specs).forEach(([specNodeId, spec]) => {
            const prefix = nsKey === 'messageReceivers' ? 'Rcv' : 'Snd'
            const node = getters.getNode(graph, specNodeId)
            variableNamesIndex.io[nsKey][specNodeId] = createNamespace(
                nodeNamespaceLabel(node, nsKey),
                {}
            )

            spec.portletIds.forEach((specPortletId) => {
                const nodeId = `n_io${prefix}_${specNodeId}_${specPortletId}`
                if (graph[nodeId]) {
                    throw new Error(`Node id ${nodeId} already exists in graph`)
                }
                variableNamesIndex.io[nsKey][specNodeId]![specPortletId] = {
                    nodeId,
                    funcName: `io${
                        nsKey === 'messageReceivers' ? 'Rcv' : 'Snd'
                    }_${specNodeId}_${specPortletId}`,
                }
            })
        })
    })

export const attachColdDspGroup = (
    variableNamesIndex: VariableNamesIndex,
    groupId: string
) => {
    return (variableNamesIndex.coldDspGroups[groupId] = `coldDsp_${groupId}`)
}

export const attachNodeImplementationVariable = (
    variableNamesIndex: VariableNamesIndex,
    nsKey: 'stateClass',
    nodeType: DspGraph.NodeType,
    nodeImplementation: NodeImplementation
) => {
    switch (nsKey) {
        case 'stateClass':
            return (variableNamesIndex.nodeImplementations[
                nodeType
            ]!.stateClass = `State_${_v(
                (nodeImplementation.flags
                    ? nodeImplementation.flags.alphaName
                    : null) || nodeType
            )}`)
    }
}

export const assertValidNamePart = (namePart: string) => {
    const isInvalid = !VALID_NAME_PART_REGEXP.exec(namePart)
    if (isInvalid) {
        throw new Error(
            `Invalid variable name for code generation "${namePart}"`
        )
    }
    return namePart
}
const _v = assertValidNamePart

const _nodeType = (nodeType: string) => nodeType.replace(/[^a-zA-Z0-9_]/g, '')

const _namePrefix = (debug: boolean, node: DspGraph.Node) =>
    debug ? _v(`${_nodeType(node.type)}_${node.id}`) : _v(node.id)

const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/
