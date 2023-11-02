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
import { createNamespace } from './namespace'
import {
    NodeImplementations,
    CodeVariableNames,
    Compilation,
    CodeVariableName,
} from '../compile/types'

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 *
 * @param nodeImplementations
 * @param graph
 * @returns
 */
export const generate = (
    nodeImplementations: NodeImplementations,
    graph: DspGraph.Graph,
    debug: boolean
): CodeVariableNames => ({
    nodes: createNamespace(
        'n',
        mapObject(graph, (node) => {
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                node.type
            )
            const namespaceLabel = `[${node.type}] ${node.id}`
            const prefix = _namePrefix(debug, node)
            return {
                rcvs: createNamespace(`${namespaceLabel}.rcvs`, {}),
                outs: createNamespace(`${namespaceLabel}.outs`, {}),
                snds: createNamespace(`${namespaceLabel}.snds`, {}),
                state: createNamespace(
                    `${namespaceLabel}.state`,
                    mapObject(
                        nodeImplementation.stateVariables,
                        (_, stateVariable) =>
                            `${prefix}_STATE_${_v(stateVariable)}`
                    )
                ),
            }
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

export const attachNodeOut = (
    compilation: Compilation,
    nodeId: DspGraph.NodeId,
    portletId: DspGraph.PortletId
): CodeVariableName => {
    const { graph, codeVariableNames, debug } = compilation
    const sinkNode = getters.getNode(graph, nodeId)
    const prefix = _namePrefix(debug, sinkNode)
    return (codeVariableNames.nodes[nodeId].outs[
        portletId
    ] = `${prefix}_OUTS_${_v(portletId)}`)
}

export const attachNodeSnd = (
    compilation: Compilation,
    nodeId: DspGraph.NodeId,
    portletId: DspGraph.PortletId
): CodeVariableName => {
    const { graph, codeVariableNames, debug } = compilation
    const sinkNode = getters.getNode(graph, nodeId)
    const prefix = _namePrefix(debug, sinkNode)
    return (codeVariableNames.nodes[nodeId].snds[
        portletId
    ] = `${prefix}_SNDS_${_v(portletId)}`)
}

export const attachNodeRcv = (
    compilation: Compilation,
    nodeId: DspGraph.NodeId,
    portletId: DspGraph.PortletId
): CodeVariableName => {
    const { graph, codeVariableNames, debug } = compilation
    const sinkNode = getters.getNode(graph, nodeId)
    const prefix = _namePrefix(debug, sinkNode)
    return (codeVariableNames.nodes[nodeId].rcvs[
        portletId
    ] = `${prefix}_RCVS_${_v(portletId)}`)
}

/**
 * Helper that attaches to the generated `codeVariableNames` the names of specified outlet listeners.
 *
 * @param codeVariableNames
 * @param outletListenerSpecs
 */
export const attachOutletListeners = ({
    codeVariableNames,
    outletListenerSpecs,
}: Compilation): void =>
    Object.entries(outletListenerSpecs).forEach(([nodeId, outletIds]) => {
        codeVariableNames.outletListeners[nodeId] = {}
        outletIds.forEach((outletId) => {
            codeVariableNames.outletListeners[nodeId][
                outletId
            ] = `outletListener_${nodeId}_${outletId}`
        })
    })

/**
 * Helper that attaches to the generated `codeVariableNames` the names of specified inlet callers.
 *
 * @param codeVariableNames
 * @param inletCallerSpecs
 */
export const attachInletCallers = ({
    codeVariableNames,
    inletCallerSpecs,
}: Compilation): void =>
    Object.entries(inletCallerSpecs).forEach(([nodeId, inletIds]) => {
        codeVariableNames.inletCallers[nodeId] = {}
        inletIds.forEach((inletId) => {
            codeVariableNames.inletCallers[nodeId][
                inletId
            ] = `inletCaller_${nodeId}_${inletId}`
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
