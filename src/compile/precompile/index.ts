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
import {
    VariableNamesAssigner,
    createVariableNamesIndex,
} from './variable-names-index'
import {
    buildFullGraphTraversal,
    buildGraphTraversalSignal,
    getGraphSignalSinks,
    getNodeImplementationsUsedInGraph,
} from '../compile-helpers'
import { createNamespace } from '../compile-helpers'
import { PrecompilationInput, Precompilation, PrecompiledCode } from './types'
import { Sequence, ast } from '../../ast/declare'
import precompileDependencies from './dependencies'
import {
    precompileInitialization,
    precompileMessageReceivers,
    precompileInlineDsp,
    precompileDsp,
    precompileState,
} from './nodes'
import {
    precompileSignalInletWithNoSource,
    precompileMessageInlet,
    precompileSignalOutlet,
    precompileMessageOutlet,
} from './portlet'
import {
    buildColdDspGroups,
    removeNodesFromTraversal,
    buildHotDspGroup,
    buildInlinableDspGroups,
    buildGroupSinkConnections,
} from './dsp-groups'
import { DspGroup } from './types'
import { precompileCore, precompileStateClass } from './node-implementations'
import {
    addMessageReceiverNode,
    addMessageSenderNode,
    addNodeImplementationsForMessageIo,
} from './io'
import { NodeImplementation } from '../types'

export default (precompilationInput: PrecompilationInput) => {
    const precompilation = initializePrecompilation(precompilationInput)

    precompilation.input.nodeImplementations =
        addNodeImplementationsForMessageIo(
            precompilation.input.nodeImplementations
        )

    Object.entries(precompilationInput.settings.io.messageReceivers).forEach(
        ([specNodeId, spec]) => {
            const node = getters.getNode(precompilation.input.graph, specNodeId)
            attachIoMessageReceiverForNode(precompilation.output, node)
            spec.portletIds.forEach((specInletId) => {
                precompilation.input.graph = addMessageReceiverNode(
                    precompilation,
                    specNodeId,
                    specInletId
                )
            })
        }
    )

    Object.entries(precompilationInput.settings.io.messageSenders).forEach(
        ([specNodeId, spec]) => {
            const node = getters.getNode(precompilation.input.graph, specNodeId)
            attachIoMessageSenderForNode(precompilation.output, node)
            spec.portletIds.forEach((specInletId) => {
                precompilation.input.graph = addMessageSenderNode(
                    precompilation,
                    specNodeId,
                    specInletId
                )
            })
        }
    )

    precompilation.input.graph = traversers.trimGraph(
        precompilation.input.graph,
        buildFullGraphTraversal(precompilation.input.graph)
    )

    // Remove unused node implementations
    precompilation.input.nodeImplementations =
        getNodeImplementationsUsedInGraph(
            precompilation.input.graph,
            precompilation.input.nodeImplementations
        )

    attachGraph(precompilation.output, precompilation.input.graph)

    const nodes = traversers.toNodes(
        precompilation.input.graph,
        precompilation.output.graph.fullTraversal
    )

    // -------------------- NODE IMPLEMENTATIONS & STATES ------------------ //
    Object.entries(precompilation.input.nodeImplementations).forEach(
        ([nodeType, nodeImplementation]) => {
            attachNodeImplementation(
                precompilation.output,
                nodeType,
                nodeImplementation
            )
            precompileStateClass(precompilation, nodeType)
            precompileCore(precompilation, nodeType)
        }
    )
    nodes.forEach((node) => {
        attachNode(precompilation.output, node)
        precompileState(precompilation, node)
    })

    // ------------------------ DSP GROUPS ------------------------ //
    const rootDspGroup: DspGroup = {
        traversal: buildGraphTraversalSignal(precompilation.input.graph),
        outNodesIds: getGraphSignalSinks(precompilation.input.graph).map(
            (node) => node.id
        ),
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
            functionName:
                precompilation.proxies.variableNamesAssigner.coldDspGroups[
                    groupId
                ]!,
            dspGroup,
            sinkConnections: buildGroupSinkConnections(
                precompilation.input.graph,
                dspGroup
            ),
        }
    })

    // ------------------------ PORTLETS ------------------------ //
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
        traversers
            .toNodes(precompilation.input.graph, dspGroup.traversal)
            .forEach((node) => {
                Object.values(node.outlets).forEach((outlet) => {
                    precompileSignalOutlet(precompilation, node, outlet.id)
                })
            })
    })

    // ------------------------ NODE ------------------------ //
    inlinableDspGroups.forEach((dspGroup) => {
        precompileInlineDsp(precompilation, dspGroup)
    })

    allDspGroups.forEach((dspGroup) => {
        traversers
            .toNodes(precompilation.input.graph, dspGroup.traversal)
            .forEach((node) => {
                precompileDsp(precompilation, node)
            })
    })

    // This must come after we have assigned all node variables.
    nodes.forEach((node) => {
        precompileInitialization(precompilation, node)
        precompileMessageReceivers(precompilation, node)
    })

    // ------------------------ MISC ------------------------ //
    precompileDependencies(precompilation)

    return precompilation
}

export const initializePrecompilation = (
    precompilationRawInput: PrecompilationInput
): Precompilation => {
    const precompiledCode = generatePrecompiledCode()
    const variableNamesIndex = createVariableNamesIndex()
    const precompilationInput: PrecompilationInput = {
        graph: { ...precompilationRawInput.graph },
        nodeImplementations: { ...precompilationRawInput.nodeImplementations },
        settings: precompilationRawInput.settings,
    }

    return {
        input: precompilationInput,
        output: precompiledCode,
        variableNamesIndex,
        proxies: {
            variableNamesAssigner: VariableNamesAssigner({
                variableNamesIndex,
                input: precompilationInput,
            }),
        },
    }
}

export const generatePrecompiledCode = (): PrecompiledCode => {
    const precompiledCode: PrecompiledCode = {
        graph: {
            fullTraversal: [],
            hotDspGroup: {
                traversal: [],
                outNodesIds: [],
            },
            coldDspGroups: createNamespace('coldDspGroups', {}),
        },
        nodeImplementations: createNamespace('nodeImplementations', {}),
        nodes: createNamespace('nodes', {}),
        dependencies: {
            imports: [],
            exports: [],
            ast: Sequence([]),
        },
        io: {
            messageReceivers: createNamespace('io:messageReceivers', {}),
            messageSenders: createNamespace('io:messageSenders', {}),
        },
    }
    return precompiledCode
}

export const attachNodeImplementation = (
    precompiledCode: PrecompiledCode,
    nodeType: DspGraph.NodeType,
    nodeImplementation: NodeImplementation
) => {
    precompiledCode.nodeImplementations[nodeType] = {
        nodeImplementation,
        stateClass: null,
        core: null,
    }
}

export const attachNode = (
    precompiledCode: PrecompiledCode,
    node: DspGraph.Node
) => {
    precompiledCode.nodes[node.id] = {
        nodeType: node.type,
        messageReceivers: createNamespace('messageReceivers', {}),
        messageSenders: createNamespace('messageSenders', {}),
        signalOuts: createNamespace('signalOuts', {}),
        signalIns: createNamespace('signalOuts', {}),
        initialization: ast``,
        dsp: {
            loop: ast``,
            inlets: createNamespace('dsp:inlets', {}),
        },
        state: null,
    }
}

const attachGraph = (
    precompiledCode: PrecompiledCode,
    graph: DspGraph.Graph
) => {
    precompiledCode.graph.fullTraversal = buildFullGraphTraversal(graph)
}

export const attachIoMessageReceiverForNode = (
    precompiledCode: PrecompiledCode,
    node: DspGraph.Node
) => {
    precompiledCode.io.messageReceivers[node.id] = createNamespace(
        `io:messageReceivers:${node.id}`,
        {}
    )
}

export const attachIoMessageSenderForNode = (
    precompiledCode: PrecompiledCode,
    node: DspGraph.Node
) => {
    precompiledCode.io.messageSenders[node.id] = createNamespace(
        `io:messageSenders:${node.id}`,
        {}
    )
}
