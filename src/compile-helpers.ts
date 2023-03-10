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
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from './constants'
import { DspGraph, getters, traversal } from './dsp-graph'
import {
    AudioSettings,
    Code,
    Compilation,
    EngineMetadata,
    NodeImplementation,
    NodeImplementations,
    PortletsIndex,
} from './types'

/** Helper to get node implementation or throw an error if not implemented. */
export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: DspGraph.NodeType
): Required<NodeImplementation<DspGraph.NodeArguments>> => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node [${nodeType}] is not implemented`)
    }
    return {
        stateVariables: {},
        declare: () => '',
        loop: () => '',
        messages: () => ({}),
        sharedCode: [],
        ...nodeImplementation,
    }
}

/** Helper to build engine metadata from compilation object */
export const buildMetadata = (compilation: Compilation): EngineMetadata => {
    const {
        audioSettings,
        inletCallerSpecs,
        outletListenerSpecs,
        codeVariableNames,
    } = compilation
    return {
        audioSettings: {
            ...audioSettings,
            // Determined at configure
            sampleRate: 0,
            blockSize: 0,
        },
        compilation: {
            inletCallerSpecs,
            outletListenerSpecs,
            codeVariableNames: {
                inletCallers: codeVariableNames.inletCallers,
                outletListeners: codeVariableNames.outletListeners,
            },
        },
    }
}

/**
 * Takes the graph traversal, and for each node directly assign the
 * inputs of its next nodes where this can be done.
 * This allow the engine to avoid having to copy between a node's outs
 * and its next node's ins in order to pass data around.
 *
 * @returns Maps that contain inlets and outlets that have been handled
 * by precompilation and don't need to be dealt with further.
 */
export const preCompileSignalAndMessageFlow = (compilation: Compilation) => {
    const {
        graph,
        graphTraversal,
        codeVariableNames,
        inletCallerSpecs,
        outletListenerSpecs,
    } = compilation
    const graphTraversalNodes = graphTraversal.map((nodeId) =>
        getters.getNode(graph, nodeId)
    )
    const precompiledInlets: PortletsIndex = {}
    const precompiledOutlets: PortletsIndex = {}
    const _pushEntry = (
        portletsIndex: PortletsIndex,
        nodeId: DspGraph.NodeId,
        portletId: DspGraph.PortletId
    ) => {
        portletsIndex[nodeId] = portletsIndex[nodeId] || []
        if (!portletsIndex[nodeId].includes(portletId)) {
            portletsIndex[nodeId].push(portletId)
        }
    }

    graphTraversalNodes.forEach((node) => {
        const { outs, snds } = codeVariableNames.nodes[node.id]
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            const outletSinks = getters.getSinks(node, outletId)
            const nodeOutletListenerSpecs = outletListenerSpecs[node.id] || []

            // Signal inlets can receive input from ONLY ONE signal.
            // Therefore, we replace signal inlet directly with
            // previous node's outs. e.g. instead of :
            //
            //      NODE1_OUT = A + B
            //      NODE2_IN = NODE1_OUT
            //      NODE2_OUT = NODE2_IN * 2
            //
            // we will have :
            //
            //      NODE1_OUT = A + B
            //      NODE2_OUT = NODE1_OUT * 2
            //
            if (outlet.type === 'signal') {
                outletSinks.forEach((sink) => {
                    codeVariableNames.nodes[sink.nodeId].ins[sink.portletId] =
                        outs[outletId]
                    _pushEntry(precompiledInlets, sink.nodeId, sink.portletId)
                })

                // For a message outlet that sends to a single sink node
                // its out can be directly replaced by next node's in.
                // e.g. instead of :
                //
                //      const NODE1_MSG = () => {
                //          NODE1_SND('bla')
                //      }
                //
                //      const NODE1_SND = NODE2_MSG
                //
                // we can have :
                //
                //      const NODE1_MSG = () => {
                //          NODE2_MSG('bla')
                //      }
                //
            } else if (outlet.type === 'message') {
                if (
                    outletSinks.length === 1 &&
                    !nodeOutletListenerSpecs.includes(outlet.id)
                ) {
                    snds[outletId] =
                        codeVariableNames.nodes[outletSinks[0].nodeId].rcvs[
                            outletSinks[0].portletId
                        ]
                    _pushEntry(precompiledOutlets, node.id, outletId)

                    // Same thing if there's no sink, but one outlet listener
                } else if (
                    outletSinks.length === 0 &&
                    nodeOutletListenerSpecs.includes(outlet.id)
                ) {
                    snds[outletId] =
                        codeVariableNames.outletListeners[node.id][outletId]
                    _pushEntry(precompiledOutlets, node.id, outletId)

                    // If no sink, no message receiver, we assign the node SND
                    // a function that does nothing
                } else if (
                    outletSinks.length === 0 &&
                    !nodeOutletListenerSpecs.includes(outlet.id)
                ) {
                    snds[outletId] =
                        compilation.codeVariableNames.globs.nullMessageReceiver
                    _pushEntry(precompiledOutlets, node.id, outletId)
                }
            }
        })

        Object.entries(node.inlets).forEach(([inletId, inlet]) => {
            const nodeInletCallerSpecs = inletCallerSpecs[node.id] || []
            // If message inlet has no source, no need to compile it.
            if (
                inlet.type === 'message' &&
                getters.getSources(node, inletId).length === 0 &&
                !nodeInletCallerSpecs.includes(inlet.id)
            ) {
                _pushEntry(precompiledInlets, node.id, inletId)
            }
        })
    })
    compilation.precompiledPortlets.precompiledInlets = precompiledInlets
    compilation.precompiledPortlets.precompiledOutlets = precompiledOutlets
}

export const replaceCoreCodePlaceholders = (
    bitDepth: AudioSettings['bitDepth'],
    code: Code
) => {
    const Int = 'i32'
    const Float = bitDepth === 32 ? 'f32' : 'f64'
    const FloatArray = bitDepth === 32 ? 'Float32Array' : 'Float64Array'
    const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
    const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
    return code
        .replaceAll('${Int}', Int)
        .replaceAll('${Float}', Float)
        .replaceAll('${FloatArray}', FloatArray)
        .replaceAll('${getFloat}', getFloat)
        .replaceAll('${setFloat}', setFloat)
        .replaceAll('${FS_OPERATION_SUCCESS}', FS_OPERATION_SUCCESS.toString())
        .replaceAll('${FS_OPERATION_FAILURE}', FS_OPERATION_FAILURE.toString())
}

/**
 * Build graph traversal for the compilation.
 * We first put nodes that push messages, so they have the opportunity
 * to change the engine state before running the loop.
 * !!! This is not fullproof ! For example if a node is pushing messages
 * but also writing signal outputs, it might be run too early / too late.
 * @TODO : outletListeners should also be included ?
 */
export const graphTraversalForCompile = (
    graph: DspGraph.Graph,
    inletCallerSpecs: PortletsIndex
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )
    const graphTraversalSignal = traversal.messageNodes(
        graph,
        nodesPushingMessages
    )
    const combined = graphTraversalSignal
    traversal.signalNodes(graph, nodesPullingSignal).forEach((nodeId) => {
        if (combined.indexOf(nodeId) === -1) {
            combined.push(nodeId)
        }
    })

    Object.keys(inletCallerSpecs).forEach((nodeId) => {
        if (combined.indexOf(nodeId) === -1) {
            combined.push(nodeId)
        }
    })
    return combined
}

export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array
