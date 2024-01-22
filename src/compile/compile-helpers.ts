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
import { DspGraph, getters, traversers } from '../dsp-graph'
import packageInfo from '../../package.json'
import jsMacros from '../engine-javascript/compile/macros'
import ascMacros from '../engine-assemblyscript/compile/macros'
import {
    Compilation,
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeGeneratorWithSettings,
    NodeImplementation,
    NodeImplementations,
} from './types'
import { EngineMetadata } from '../run/types'
import { CodeMacros } from '../ast/types'

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

/** Helper to build engine metadata from compilation object */
export const buildMetadata = (compilation: Compilation): EngineMetadata => {
    const {
        settings: {
            audio: audioSettings,
            io,
        },
        variableNamesIndex,
    } = compilation
    return {
        libVersion: packageInfo.version,
        audioSettings: {
            ...audioSettings,
            // Determined at configure
            sampleRate: 0,
            blockSize: 0,
        },
        compilation: {
            io,
            variableNamesIndex: {
                io: variableNamesIndex.io,
            },
        },
    }
}

/**
 * Build graph traversal for all nodes.
 * This should be exhaustive so that all nodes that are connected
 * to an input or output of the graph are declared correctly.
 * Order of nodes doesn't matter.
 * @TODO : messageSenders should also be included ?
 */
export const buildFullGraphTraversal = (
    graph: DspGraph.Graph,
    io: Compilation['settings']['io']
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )
    Object.keys(io.messageReceivers || {}).forEach((nodeId) => {
        if (nodesPushingMessages.find((node) => node.id === nodeId)) {
            return
        }
        nodesPushingMessages.push(getters.getNode(graph, nodeId))
    })

    return Array.from(
        new Set([
            ...traversers.messageTraversal(graph, nodesPushingMessages),
            ...traversers.signalTraversal(graph, nodesPullingSignal),
        ])
    )
}

/**
 * Build graph traversal for generating the loop.
 */
export const buildGraphTraversalSignal = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    return traversers.signalTraversal(graph, nodesPullingSignal)
}

export const isGlobalDefinitionWithSettings = (
    globalCodeDefinition: GlobalCodeDefinition
): globalCodeDefinition is GlobalCodeGeneratorWithSettings =>
    !(typeof globalCodeDefinition === 'function')
