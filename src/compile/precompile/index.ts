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

import { DspGraph, getters, traversers } from '../../dsp-graph'
import { mapObject } from '../../functional-helpers'
import {
    attachColdDspGroup,
    attachIoMessages,
    generateVariableNamesIndex,
} from './variable-names-index'
import {
    buildGraphTraversalSignal,
    getNodeImplementation,
    getNodeImplementationsUsedInGraph,
} from '../compile-helpers'
import { createNamespace, nodeNamespaceLabel } from '../compile-helpers'
import { PrecompilationInput, PrecompilationOperation, PrecompiledCode } from './types'
import { Sequence, ast } from '../../ast/declare'
import precompileDependencies from './dependencies'
import {
    precompileSignalInletWithNoSource,
    precompileMessageInlet,
    precompileSignalOutlet,
    precompileMessageOutlet,
    precompileInitialization,
    precompileMessageReceivers,
    precompileInlineDsp,
    precompileDsp,
    precompileState,
    precompileCaching,
} from './nodes'
import {
    buildColdDspGroups,
    removeNodesFromTraversal,
    buildHotDspGroup,
    buildInlinableDspGroups,
    buildGroupSinkConnections,
} from './dsp-groups'
import { DspGroup } from './types'
import { precompileCore, precompileStateClass } from './node-implementations'

export default (
    precompilationInput: PrecompilationInput,
    fullTraversal: DspGraph.GraphTraversal
) => {
    const precompilation: PrecompilationOperation = {
        input: precompilationInput,
        output: initializePrecompiledCode(precompilationInput, fullTraversal),
    }
    const { graph, settings } = precompilationInput
    const nodes = traversers.toNodes(
        graph,
        precompilation.output.graph.fullTraversal
    )

    // -------------------- NODE IMPLEMENTATIONS ------------------ //
    Object.keys(precompilation.output.nodeImplementations).forEach(
        (nodeType) => {
            precompileStateClass(precompilation, nodeType)
            precompileCore(precompilation, nodeType)
        }
    )

    // ------------------------ DSP GROUPS ------------------------ //
    const rootDspGroup: DspGroup = {
        traversal: buildGraphTraversalSignal(graph),
        // TODO : this is duplicate from `buildGraphTraversalSignal`
        outNodesIds: Object.values(graph)
            .filter((node) => !!node.isPullingSignal)
            .map((node) => node.id),
    }
    const coldDspGroups = buildColdDspGroups(precompilation, rootDspGroup)
    const hotDspGroup = buildHotDspGroup(
        precompilation,
        rootDspGroup,
        coldDspGroups
    )
    const allDspGroups = [hotDspGroup, ...coldDspGroups]
    const inlinableDspGroups = allDspGroups.flatMap((parentDspGroup) => {
        const inlinableDspGroups = buildInlinableDspGroups(
            precompilation,
            parentDspGroup
        )
        // Nodes that will be inlined shouldnt be in the traversal for
        // their parent dsp group.
        parentDspGroup.traversal = removeNodesFromTraversal(
            parentDspGroup.traversal,
            inlinableDspGroups.flatMap((dspGroup) => dspGroup.traversal)
        )

        return inlinableDspGroups
    })

    precompilation.output.graph.hotDspGroup = hotDspGroup
    coldDspGroups.forEach((dspGroup, index) => {
        const groupId = `${index}`
        precompilation.output.graph.coldDspGroups[groupId] = {
            ...dspGroup,
            sinkConnections: buildGroupSinkConnections(graph, dspGroup),
        }
        attachColdDspGroup(precompilation.output.variableNamesIndex, groupId)
    })

    // ------------------------ PORTLETS ------------------------ //
    attachIoMessages(precompilation.output.variableNamesIndex, settings, graph)

    // Go through the graph and precompile inlets.
    nodes.forEach((node) => {
        Object.values(node.inlets).forEach((inlet) => {
            if (inlet.type === 'signal') {
                if (getters.getSources(node, inlet.id).length === 0) {
                    precompileSignalInletWithNoSource(
                        precompilation,
                        node,
                        inlet.id
                    )
                }
            } else if (inlet.type === 'message') {
                precompileMessageInlet(precompilation, node, inlet.id)
            }
        })
    })

    // Go through the graph and precompile message outlets.
    //
    // For example if a node has only one sink there is no need
    // to copy values between outlet and sink's inlet. Instead we can
    // collapse these two variables into one.
    //
    // We need to compile outlets after inlets because they reference
    // message receivers.
    nodes.forEach((node) => {
        Object.values(node.outlets)
            .filter((outlet) => outlet.type === 'message')
            .forEach((outlet) => {
                precompileMessageOutlet(precompilation, node, outlet.id)
            })
    })

    // Go through all dsp groups and precompile signal outlets for nodes that
    // are not inlined.
    allDspGroups.forEach((dspGroup) => {
        traversers.toNodes(graph, dspGroup.traversal).forEach((node) => {
            Object.values(node.outlets).forEach((outlet) => {
                precompileSignalOutlet(precompilation, node, outlet.id)
            })
        })
    })

    // ------------------------ DSP ------------------------ //
    inlinableDspGroups.forEach((dspGroup) => {
        precompileInlineDsp(precompilation, dspGroup)
    })

    allDspGroups.forEach((dspGroup) => {
        traversers.toNodes(graph, dspGroup.traversal).forEach((node) => {
            precompileCaching(precompilation, node)
            precompileDsp(precompilation, node)
        })
    })

    // ------------------------ NODE ------------------------ //
    // This must come after we have assigned all node variables.
    nodes.forEach((node) => {
        precompileState(precompilation, node)
        precompileInitialization(precompilation, node)
        precompileMessageReceivers(precompilation, node)
    })

    // ------------------------ MISC ------------------------ //
    precompileDependencies(precompilation)

    return precompilation.output
}

export const initializePrecompiledCode = (
    { graph, nodeImplementations, settings }: PrecompilationInput,
    fullTraversal: DspGraph.GraphTraversal
): PrecompiledCode => {
    const variableNamesIndex = generateVariableNamesIndex(
        settings,
        graph,
        nodeImplementations
    )
    return {
        variableNamesIndex,
        nodes: createNamespace(
            'nodes',
            mapObject(graph, (node) => ({
                nodeImplementation: getNodeImplementation(
                    nodeImplementations,
                    node.type
                ),
                generationContext: {
                    messageReceivers: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:messageReceivers'
                        ),
                        {}
                    ),
                    signalOuts: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:signalOuts'
                        ),
                        {}
                    ),
                    messageSenders: createNamespace(
                        nodeNamespaceLabel(
                            node,
                            'generationContext:messageSenders'
                        ),
                        {}
                    ),
                    signalIns: createNamespace(
                        nodeNamespaceLabel(node, 'generationContext:signalIns'),
                        {}
                    ),
                    state: variableNamesIndex.nodes[node.id].state,
                },
                messageReceivers: createNamespace(
                    nodeNamespaceLabel(node, 'messageReceivers'),
                    {}
                ),
                messageSenders: createNamespace(
                    nodeNamespaceLabel(node, 'messageSenders'),
                    {}
                ),
                signalOuts: createNamespace(
                    nodeNamespaceLabel(node, 'signalOuts'),
                    {}
                ),
                stateInitialization: null,
                initialization: ast``,
                dsp: ast``,
                caching: createNamespace(
                    nodeNamespaceLabel(node, 'caching'),
                    {}
                ),
                state: null,
            }))
        ),
        nodeImplementations: createNamespace(
            'nodeImplementations',
            Object.entries(
                getNodeImplementationsUsedInGraph(graph, nodeImplementations)
            ).reduce<PrecompiledCode['nodeImplementations']>(
                (
                    precompiledImplementations,
                    [nodeType, nodeImplementation]
                ) => ({
                    ...precompiledImplementations,
                    [nodeType]: {
                        nodeImplementation,
                        stateClass: null,
                        core: null,
                    },
                }),
                {}
            )
        ),
        dependencies: {
            imports: [],
            exports: [],
            ast: Sequence([]),
        },
        graph: {
            fullTraversal,
            hotDspGroup: {
                traversal: [],
                outNodesIds: [],
            },
            coldDspGroups: createNamespace('coldDspGroups', {}),
        },
    }
}
