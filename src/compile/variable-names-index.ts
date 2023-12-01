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
import { createNamespace, nodeNamespaceLabel } from './namespace'
import { VariableNamesIndex, Compilation } from './types'

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 *
 * @param nodeImplementations
 * @param graph
 * @returns
 */
export const generateVariableNamesIndex = (
    graph: DspGraph.Graph,
    debug: boolean
): VariableNamesIndex =>
    createNamespace('variableNamesIndex', {
        nodes: createNamespace(
            'nodes',
            mapObject(graph, (node) =>
                createNamespace(nodeNamespaceLabel(node), {
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
                    state: `${_namePrefix(debug, node)}_STATE`,
                })
            )
        ),
        globs: generateVariableNamesGlobs(),
        outletListeners: createNamespace('outletListeners', {}),
        inletCallers: createNamespace('inletCallers', {}),
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
    })

export const attachNodePortlet = (
    compilation: Compilation,
    nsKey: 'signalOuts' | 'messageSenders' | 'messageReceivers',
    nodeId: DspGraph.NodeId,
    portletId: DspGraph.PortletId
) => {
    const {
        graph,
        variableNamesIndex,
        settings: { debug },
    } = compilation
    const nodeVariableNames = variableNamesIndex.nodes[nodeId]
    const sinkNode = getters.getNode(graph, nodeId)
    const prefix = _namePrefix(debug, sinkNode)
    // Shouldnt throw an error if the variable already exists, as precompile might try to
    // declare it several times.
    if (!(portletId in nodeVariableNames[nsKey])) {
        nodeVariableNames[nsKey][portletId] = {
            signalOuts: `${prefix}_OUTS_${_v(portletId)}`,
            messageSenders: `${prefix}_SNDS_${_v(portletId)}`,
            messageReceivers: `${prefix}_RCVS_${_v(portletId)}`,
        }[nsKey]
    }
    return nodeVariableNames[nsKey][portletId]
}

/**
 * Helper that attaches to the generated `variableNamesIndex` the names of specified outlet listeners
 * and inlet callers.
 */
export const attachOutletListenersAndInletCallers = ({
    graph,
    variableNamesIndex,
    settings: { outletListenerSpecs, inletCallerSpecs },
}: Compilation): void =>
    (['inletCallers', 'outletListeners'] as const).forEach((nsKey) => {
        const specs =
            nsKey === 'inletCallers' ? inletCallerSpecs : outletListenerSpecs
        Object.entries(specs).forEach(([nodeId, outletIds]) => {
            const node = getters.getNode(graph, nodeId)
            variableNamesIndex[nsKey][nodeId] = createNamespace(
                nodeNamespaceLabel(node, nsKey),
                {}
            )
            outletIds.forEach((outletId) => {
                variableNamesIndex[nsKey][nodeId][
                    outletId
                ] = `${nsKey}_${nodeId}_${outletId}`
            })
        })
    })

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
