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

export const graphTraversalForCompile = (graph: DspGraph.Graph) => {
    const graphTraversalSignal = traversal.signalNodes(graph)
    const combined = graphTraversalSignal
    traversal.messageNodes(graph).forEach((node) => {
        if (combined.indexOf(node) === -1) {
            combined.push(node)
        }
    })
    return combined
}

export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array
