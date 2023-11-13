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
import { commonsCore } from '../stdlib/commons'
import { core } from '../stdlib/core'
import { msg } from '../stdlib/msg'
import { DspGraph, getters, traversal } from '../dsp-graph'
import jsMacros from '../engine-javascript/compile/macros'
import ascMacros from '../engine-assemblyscript/compile/macros'
import {
    Compilation,
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
    GlobalCodeDefinitionImport,
    GlobalCodeGeneratorContext,
    GlobalCodeGeneratorWithSettings,
    NodeImplementation,
    NodeImplementations,
    PortletsIndex,
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
        stateVariables: {},
        dependencies: [],
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

export const getGlobalCodeGeneratorContext = (
    compilation: Compilation
): GlobalCodeGeneratorContext => ({
    target: compilation.target,
    audioSettings: compilation.audioSettings,
})

/**
 * Build graph traversal for declaring nodes.
 * This should be exhaustive so that all nodes that are connected
 * to an input or output of the graph are declared correctly.
 * Order of nodes doesn't matter.
 * @TODO : outletListeners should also be included ?
 */
export const buildGraphTraversalDeclare = (
    graph: DspGraph.Graph,
    inletCallerSpecs: PortletsIndex
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )
    Object.keys(inletCallerSpecs).forEach((nodeId) => {
        if (nodesPushingMessages.find((node) => node.id === nodeId)) {
            return
        }
        nodesPushingMessages.push(getters.getNode(graph, nodeId))
    })

    return Array.from(
        new Set([
            ...traversal.messageNodes(graph, nodesPushingMessages),
            ...traversal.signalNodes(graph, nodesPullingSignal),
        ])
    )
}

/**
 * Build graph traversal for generating the loop.
 */
export const buildGraphTraversalLoop = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    return traversal.signalNodes(graph, nodesPullingSignal)
}

export const engineMinimalDependencies = (): Array<GlobalCodeDefinition> => [
    core,
    commonsCore,
    msg,
]

export const collectDependenciesFromTraversal = (
    compilation: Compilation
): Array<GlobalCodeDefinition> => {
    const { graphTraversalDeclare, graph, nodeImplementations } = compilation
    return graphTraversalDeclare.reduce<Array<GlobalCodeDefinition>>(
        (definitions, nodeId) => [
            ...definitions,
            ...getNodeImplementation(
                nodeImplementations,
                getters.getNode(graph, nodeId).type
            ).dependencies,
        ],
        []
    )
}

export const collectExports = (
    target: CompilerTarget,
    dependencies: Array<GlobalCodeDefinition>
): Array<GlobalCodeDefinitionExport> =>
    _collectExportsRecursive(dependencies)
        .filter((xprt) => !xprt.targets || xprt.targets.includes(target))
        .reduce<Array<GlobalCodeDefinitionExport>>(
            // De-duplicate exports
            (exports, xprt) =>
                exports.some((otherExport) => xprt.name === otherExport.name)
                    ? exports
                    : [...exports, xprt],
            []
        )

export const collectImports = (
    dependencies: Array<GlobalCodeDefinition>
): Array<GlobalCodeDefinitionImport> =>
    _collectImportsRecursive(dependencies).reduce<
        Array<GlobalCodeDefinitionImport>
    >(
        // De-duplicate imports
        (imports, imprt) =>
            imports.some((otherImport) => imprt.name === otherImport.name)
                ? imports
                : [...imports, imprt],
        []
    )

const _collectExportsRecursive = (dependencies: Array<GlobalCodeDefinition>) =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .flatMap(
            (
                globalCodeDefinition: GlobalCodeGeneratorWithSettings
            ): Array<GlobalCodeDefinitionExport> => [
                ...(globalCodeDefinition.dependencies
                    ? _collectExportsRecursive(
                          globalCodeDefinition.dependencies
                      )
                    : []),
                ...(globalCodeDefinition.exports || []),
            ]
        )

const _collectImportsRecursive = (dependencies: Array<GlobalCodeDefinition>) =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .flatMap(
            (
                globalCodeDefinition: GlobalCodeGeneratorWithSettings
            ): Array<GlobalCodeDefinitionImport> => [
                ...(globalCodeDefinition.dependencies
                    ? _collectImportsRecursive(
                          globalCodeDefinition.dependencies
                      )
                    : []),
                ...(globalCodeDefinition.imports || []),
            ]
        )

export const isGlobalDefinitionWithSettings = (
    globalCodeDefinition: GlobalCodeDefinition
): globalCodeDefinition is GlobalCodeGeneratorWithSettings =>
    !(typeof globalCodeDefinition === 'function')
