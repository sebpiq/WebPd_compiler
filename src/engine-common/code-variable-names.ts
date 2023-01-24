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

import { DspGraph } from '@webpd/dsp-graph'
import { getNodeImplementation } from '../compile-helpers'
import { mapArray, mapObject } from '../functional-helpers'
import {
    NodeImplementations,
    CodeVariableNames,
    OutletListenerSpecs,
    AudioSettings,
    InletCallerSpecs,
} from '../types'

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
        Object.values(graph).reduce<CodeVariableNames['nodes']>(
            (nodeMap, node) => {
                const nodeImplementation = getNodeImplementation(
                    nodeImplementations,
                    node.type
                )
                const namespaceLabel = `[${node.type}] ${node.id}`
                const prefix = debug
                    ? _v(
                          `${node.type.replace(/[^a-zA-Z0-9_]/g, '')}_${
                              node.id
                          }`
                      )
                    : _v(node.id)

                nodeMap[node.id] = {
                    ins: createNamespaceFromPortlets(
                        `${namespaceLabel}.ins`,
                        node.inlets,
                        'signal',
                        (inlet) => `${prefix}_INS_${_v(inlet.id)}`
                    ),
                    rcvs: createNamespaceFromPortlets(
                        `${namespaceLabel}.rcvs`,
                        node.inlets,
                        'message',
                        (inlet) => `${prefix}_RCVS_${_v(inlet.id)}`
                    ),
                    outs: createNamespaceFromPortlets(
                        `${namespaceLabel}.outs`,
                        node.outlets,
                        'signal',
                        (outlet) => `${prefix}_OUTS_${_v(outlet.id)}`
                    ),
                    snds: createNamespaceFromPortlets(
                        `${namespaceLabel}.snds`,
                        node.outlets,
                        'message',
                        (outlet) => `${prefix}_SNDS_${_v(outlet.id)}`
                    ),
                    state: createNamespace(
                        `${namespaceLabel}.state`,
                        mapObject(
                            nodeImplementation.stateVariables,
                            (_, stateVariable) =>
                                `${prefix}_STATE_${_v(stateVariable)}`
                        )
                    ),
                }
                return nodeMap
            },
            {}
        )
    ),
    globs: createNamespace('g', {
        iterFrame: 'F',
        frame: 'FRAME',
        blockSize: 'BLOCK_SIZE',
        sampleRate: 'SAMPLE_RATE',
        output: 'OUTPUT',
        input: 'INPUT',
        // TODO : not a glob
        m: 'm',
    }),
    outletListeners: createNamespace('outletListeners', {}),
    inletCallers: createNamespace('inletCallers', {}),
    types: createNamespace('types', {}),
})

/**
 * Helper that attaches to the generated `codeVariableNames` the names of specified outlet listeners.
 *
 * @param codeVariableNames
 * @param outletListenerSpecs
 */
export const attachOutletListeners = (
    codeVariableNames: CodeVariableNames,
    outletListenerSpecs: OutletListenerSpecs
): void => {
    Object.entries(outletListenerSpecs).forEach(([nodeId, outletIds]) => {
        codeVariableNames.outletListeners[nodeId] = {}
        outletIds.forEach((outletId) => {
            codeVariableNames.outletListeners[nodeId][
                outletId
            ] = `outletListener_${nodeId}_${outletId}`
        })
    })
}

/**
 * Helper that attaches to the generated `codeVariableNames` the names of specified inlet callers.
 *
 * @param codeVariableNames
 * @param inletCallerSpecs
 */
export const attachInletCallers = (
    codeVariableNames: CodeVariableNames,
    inletCallerSpecs: InletCallerSpecs
): void => {
    Object.entries(inletCallerSpecs).forEach(([nodeId, inletIds]) => {
        codeVariableNames.inletCallers[nodeId] = {}
        inletIds.forEach((inletId) => {
            codeVariableNames.inletCallers[nodeId][
                inletId
            ] = `inletCaller_${nodeId}_${inletId}`
        })
    })
}

/**
 * Helper to attach types to variable names depending on compile target and bitDepth.
 */
export const attachTypes = (
    codeVariableNames: CodeVariableNames,
    bitDepth: AudioSettings['bitDepth']
) => {
    codeVariableNames.types.Int = 'i32'
    codeVariableNames.types.Float = bitDepth === 32 ? 'f32' : 'f64'
    codeVariableNames.types.FloatArray =
        bitDepth === 32 ? 'Float32Array' : 'Float64Array'
    codeVariableNames.types.getFloat =
        bitDepth === 32 ? 'getFloat32' : 'getFloat64'
    codeVariableNames.types.setFloat =
        bitDepth === 32 ? 'setFloat32' : 'setFloat64'
}

/**
 * Helper to generate VariableNames, essentially a proxy object that throws an error
 * when trying to access undefined properties.
 *
 * @param namespace
 * @returns
 */
export const createNamespace = <T extends Object>(
    label: string,
    namespace: T
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = String(k)
            if (!target.hasOwnProperty(key)) {
                if (key[0] === '$' && target.hasOwnProperty(key.slice(1))) {
                    return (target as any)[key.slice(1)]
                }

                // Whitelist some fields that are undefined but accessed at
                // some point or another by our code.
                if (
                    [
                        'toJSON',
                        'Symbol(Symbol.toStringTag)',
                        'constructor',
                        '$$typeof',
                        '@@__IMMUTABLE_ITERABLE__@@',
                        '@@__IMMUTABLE_RECORD__@@',
                    ].includes(key)
                ) {
                    return undefined
                }
                throw new Error(
                    `Namespace "${label}" doesn't know key "${String(key)}"`
                )
            }
            return (target as any)[key]
        },
    })
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

const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/

export const createNamespaceFromPortlets = <T>(
    label: string,
    portletMap: DspGraph.PortletMap,
    portletType: DspGraph.PortletType,
    mapFunction: (portlet: DspGraph.Portlet) => T
) =>
    createNamespace(
        label,
        mapArray(
            Object.values(portletMap).filter(
                (portlet) => portlet.type === portletType
            ),
            (portlet) => [portlet.id, mapFunction(portlet)]
        )
    )
