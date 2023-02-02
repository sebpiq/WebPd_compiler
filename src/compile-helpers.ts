/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { DspGraph, traversal } from '@webpd/dsp-graph'
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from './constants'
import {
    AudioSettings,
    Code,
    CodeVariableNames,
    Compilation,
    EngineMetadata,
    NodeImplementation,
    NodeImplementations,
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

// TODO : no need for the whole codeVariableNames here
export const replaceCoreCodePlaceholders = (
    codeVariableNames: CodeVariableNames,
    code: Code
) => {
    const { Int, Float, FloatArray, getFloat, setFloat } =
        codeVariableNames.types
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
 */
export const graphTraversalForCompile = (graph: DspGraph.Graph) => {
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
    traversal.signalNodes(graph, nodesPullingSignal).forEach((node) => {
        if (combined.indexOf(node) === -1) {
            combined.push(node)
        }
    })
    return combined
}

export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array
