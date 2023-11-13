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

import { getNodeImplementation } from './compile-helpers'
import { DspGraph, getters } from '../dsp-graph'
import { mapObject } from '../functional-helpers'
import { createNamespace, nodeNamespaceLabel } from './namespace'
import {
    NodeImplementations,
    VariableNamesIndex,
    Compilation,
} from '../compile/types'

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 *
 * @param nodeImplementations
 * @param graph
 * @returns
 */
export const generateCodeVariableNames = (
    nodeImplementations: NodeImplementations,
    graph: DspGraph.Graph,
    debug: boolean
): VariableNamesIndex =>
    createNamespace('variableNamesIndex', {
        nodes: createNamespace(
            'n',
            mapObject(graph, (node) => {
                const nodeImplementation = getNodeImplementation(
                    nodeImplementations,
                    node.type
                )
                const prefix = _namePrefix(debug, node)
                return createNamespace(nodeNamespaceLabel(node), {
                    // No need for `ins` here, as signal inlets will always directly be assigned
                    // the outlet from their source node. 
                    rcvs: createNamespace(nodeNamespaceLabel(node, 'rcvs'), {}),
                    outs: createNamespace(nodeNamespaceLabel(node, 'outs'), {}),
                    snds: createNamespace(nodeNamespaceLabel(node, 'snds'), {}),
                    state: createNamespace(
                        nodeNamespaceLabel(node, 'state'),
                        mapObject(
                            nodeImplementation.stateVariables,
                            (_, stateVariable) =>
                                `${prefix}_STATE_${_v(stateVariable)}`
                        )
                    ),
                })
            })
        ),
        globs: createNamespace('g', {
            iterFrame: 'F',
            frame: 'FRAME',
            blockSize: 'BLOCK_SIZE',
            sampleRate: 'SAMPLE_RATE',
            output: 'OUTPUT',
            input: 'INPUT',
            nullMessageReceiver: 'SND_TO_NULL',
            nullSignal: 'NULL_SIGNAL',
            // TODO : not a glob
            m: 'm',
        }),
        outletListeners: createNamespace('outletListeners', {}),
        inletCallers: createNamespace('inletCallers', {}),
    })

export const attachNodePortlet = (
    compilation: Compilation,
    nsKey: 'outs' | 'snds' | 'rcvs',
    nodeId: DspGraph.NodeId,
    portletId: DspGraph.PortletId
) => {
    const { graph, variableNamesIndex, debug } = compilation
    const nodeVariableNames = variableNamesIndex.nodes[nodeId]
    const sinkNode = getters.getNode(graph, nodeId)
    const prefix = _namePrefix(debug, sinkNode)
    // Shouldnt throw an error if the variable already exists, as precompile might try to 
    // declare it several times. 
    if (!(portletId in nodeVariableNames[nsKey])) {
        nodeVariableNames[nsKey][portletId] = ({
            'outs': `${prefix}_OUTS_${_v(portletId)}`,
            'snds': `${prefix}_SNDS_${_v(portletId)}`,
            'rcvs': `${prefix}_RCVS_${_v(portletId)}`,
        })[nsKey]
    }
    return nodeVariableNames[nsKey][portletId]
}

/**
 * Helper that attaches to the generated `variableNamesIndex` the names of specified outlet listeners
 * and inlet callers.
 */
export const attachOutletListenersAndInletCallers = ({
    variableNamesIndex,
    outletListenerSpecs,
    inletCallerSpecs,
    graph,
}: Compilation): void =>
    (['inletCallers', 'outletListeners'] as const).forEach((nsKey) => {
        const specs =
            nsKey === 'inletCallers'
                ? inletCallerSpecs
                : outletListenerSpecs
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

const _namePrefix = (debug: boolean, node: DspGraph.Node) =>
    debug
        ? _v(`${node.type.replace(/[^a-zA-Z0-9_]/g, '')}_${node.id}`)
        : _v(node.id)

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

const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/
