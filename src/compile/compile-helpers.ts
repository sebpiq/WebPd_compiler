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
import {
    AudioSettings,
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
        generateDeclarations: () => '',
        generateLoop: () => '',
        generateMessageReceivers: () => ({}),
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
        graphTraversalDeclare,
        codeVariableNames,
        inletCallerSpecs,
        outletListenerSpecs,
    } = compilation
    const graphTraversalNodes = graphTraversalDeclare.map((nodeId) =>
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

export const getGlobalCodeGeneratorContext = (
    compilation: Compilation
): GlobalCodeGeneratorContext => ({
    macros: compilation.macros,
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
 * Build graph traversal for the declaring nodes.
 * We first put nodes that push messages, so they have the opportunity
 * to change the engine state before running the loop.
 * !!! If a node is pushing messages but also writing signal outputs,
 * it will not be ran first, and stay in the signal flow.
 */
export const buildGraphTraversalLoop = (
    graph: DspGraph.Graph
): DspGraph.GraphTraversal => {
    const nodesPullingSignal = Object.values(graph).filter(
        (node) => !!node.isPullingSignal
    )
    const nodesPushingMessages = Object.values(graph).filter(
        (node) => !!node.isPushingMessages
    )

    const combined = nodesPushingMessages.map((node) => node.id)
    traversal.signalNodes(graph, nodesPullingSignal).forEach((nodeId) => {
        // If a node is already in the traversal, because it's puhsing messages,
        // we prefer to remove it and put it after so that we keep the signal traversal
        // order unchanged.
        if (combined.includes(nodeId)) {
            combined.splice(combined.indexOf(nodeId), 1)
        }
        combined.push(nodeId)
    })
    return combined
}

export const getFloatArrayType = (bitDepth: AudioSettings['bitDepth']) =>
    bitDepth === 64 ? Float64Array : Float32Array

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
