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
import { getNodeImplementation } from './compile-helpers'
import {
    NodeImplementations,
    EngineVariableNames,
    NodeVariableNames,
    InletListenerSpecs,
} from './types'

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 *
 * @param nodeImplementations
 * @param graph
 * @returns
 */
export const generateEngineVariableNames = (
    nodeImplementations: NodeImplementations,
    graph: DspGraph.Graph
): EngineVariableNames => ({
    n: createNamespace(
        Object.values(graph).reduce<EngineVariableNames['n']>(
            (nodeMap, node) => {
                const nodeImplementation = getNodeImplementation(
                    nodeImplementations,
                    node.type
                )
                const nodeStateVariables =
                    nodeImplementation.stateVariables || []
                nodeMap[node.id] = {
                    ins: createNamespace(
                        Object.values(node.inlets).reduce<
                            NodeVariableNames['ins']
                        >((nameMap, inlet) => {
                            nameMap[inlet.id] = `${_v(node.id)}_INS_${_v(inlet.id)}`
                            return nameMap
                        }, {})
                    ),
                    outs: createNamespace(
                        Object.values(node.outlets).reduce<
                            NodeVariableNames['outs']
                        >((nameMap, outlet) => {
                            nameMap[outlet.id] = `${_v(node.id)}_OUTS_${_v(outlet.id)}`
                            return nameMap
                        }, {})
                    ),
                    state: createNamespace(
                        nodeStateVariables.reduce<NodeVariableNames['state']>(
                            (nameMap, stateVariable) => {
                                nameMap[stateVariable] = `${_v(node.id)}_STATE_${_v(stateVariable)}`
                                return nameMap
                            },
                            {}
                        )
                    ),
                }
                return nodeMap
            },
            {}
        )
    ),
    g: {
        arrays: 'ARRAYS',
        // Reusable variable to iterate over outlets
        iterOutlet: 'O',
        // Frame count, reinitialized at each loop start
        iterFrame: 'F',
        // Frame count, never reinitialized
        frame: 'FRAME',
        blockSize: 'BLOCK_SIZE',
        sampleRate: 'SAMPLE_RATE',
        output: 'OUTPUT',
        input: 'INPUT',
    },
    accessors: createNamespace({}),
    inletListeners: createNamespace({}),
    types: {}
})

/**
 * Helper that attaches to the generated `engineVariableNames` the names of specified inlet listeners.
 *
 * @param engineVariableNames
 * @param inletListenerSpecs
 */
export const attachInletListenersVariableNames = (
    engineVariableNames: EngineVariableNames,
    inletListenerSpecs: InletListenerSpecs
): void => {
    Object.entries(inletListenerSpecs).forEach(([nodeId, inletIds]) => {
        engineVariableNames.inletListeners[nodeId] = {}
        inletIds.forEach((inletId) => {
            engineVariableNames.inletListeners[nodeId][
                inletId
            ] = `inletListener_${nodeId}_${inletId}`
        })
    })
}

/**
 * Helper to generate VariableNames, essentially a proxy object that throws an error
 * when trying to access undefined properties.
 *
 * @param namespace
 * @returns
 */
export const createNamespace = <T extends Object>(namespace: T) => {
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
                throw new Error(`Namespace doesn't know key "${String(key)}"`)
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