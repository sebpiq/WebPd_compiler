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
import { DspGraph, traversers } from '../dsp-graph'
import jsMacros from '../engine-javascript/compile/macros'
import ascMacros from '../engine-assemblyscript/compile/macros'
import {
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeGeneratorWithSettings,
    NodeImplementation,
    NodeImplementations,
    CompilationSettings,
} from './types'
import { CodeMacros } from "./render/types"

/** Helper to get code macros from compile target. */
export const getMacros = (target: CompilerTarget): CodeMacros =>
    ({ javascript: jsMacros, assemblyscript: ascMacros }[target])

/** Helper to get node implementation or throw an error if not implemented. */
export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: DspGraph.NodeType
): NodeImplementation<DspGraph.NodeArguments> => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node [${nodeType}] is not implemented`)
    }
    return {
        dependencies: [],
        ...nodeImplementation,
    }
}

export const getNodeImplementationsUsedInGraph = (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations
) =>
    Object.values(graph).reduce<{
        [nodeType: DspGraph.NodeType]: NodeImplementation
    }>((nodeImplementationsUsedInGraph, node) => {
        if (node.type in nodeImplementationsUsedInGraph) {
            return nodeImplementationsUsedInGraph
        } else {
            return {
                ...nodeImplementationsUsedInGraph,
                [node.type]: getNodeImplementation(
                    nodeImplementations,
                    node.type
                ),
            }
        }
    }, {})

/**
 * Build graph traversal for all nodes.
 * This should be exhaustive so that all nodes that are connected
 * to an input or output of the graph are declared correctly.
 * Order of nodes doesn't matter.
 */
export const buildFullGraphTraversal = (
    graph: DspGraph.Graph,
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )

    return Array.from(
        new Set([
            ...traversers.messageTraversal(graph, nodesPushingMessages),
            ...traversers.signalTraversal(graph, nodesPullingSignal),
        ])
    )
}

/**
 * Build graph traversal for all signal nodes.
 */
export const buildGraphTraversalSignal = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal => 
    traversers.signalTraversal(graph, getGraphSignalSinks(graph))

export const getGraphSignalSinks = (
    graph: DspGraph.Graph
) => Object.values(graph).filter(
    (node) => !!node.isPullingSignal
)

export const isGlobalDefinitionWithSettings = (
    globalCodeDefinition: GlobalCodeDefinition
): globalCodeDefinition is GlobalCodeGeneratorWithSettings =>
    !(typeof globalCodeDefinition === 'function')
/**
 * Helper to declare namespace objects enforcing stricter access rules. Specifically, it forbids :
 * - reading an unknown property.
 * - trying to overwrite an existing property.
 *
 * Also allows to access properties starting with a number by prepending a `$`.
 * This is convenient to access portlets by their id without using indexing syntax, for example :
 * `namespace.$0` instead of `namespace['0']`.
 */

export const createNamespace = <T extends Object>(
    label: string,
    namespace: T
) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = _trimDollarKey(String(k))
            if (!target.hasOwnProperty(key as PropertyKey)) {
                // Whitelist some fields that are undefined but accessed at
                // some point or another by our code.
                // TODO : find a better way to do this.
                if (
                    [
                        'toJSON',
                        'Symbol(Symbol.toStringTag)',
                        'constructor',
                        '$typeof',
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

        set: (target, k, newValue) => {
            const key = _trimDollarKey(String(k)) as keyof T
            if (target.hasOwnProperty(key)) {
                throw new Error(
                    `Key "${String(
                        key
                    )}" is protected and cannot be overwritten.`
                )
            } else {
                target[key] = newValue
            }
            return newValue
        },
    })
}

export const nodeNamespaceLabel = (
    node: DspGraph.Node,
    namespaceName?: string
) => `${node.type}:${node.id}${namespaceName ? `:${namespaceName}` : ''}`
const _trimDollarKey = (key: string) => {
    const match = /\$(.*)/.exec(key)
    if (!match) {
        return key
    } else {
        return match[1]!
    }
}
