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

import { getters, traversers } from '../../dsp-graph'
import {
    PrecompiledCodeAssigner,
    VariableNamesAssigner,
    createPrecompiledCode,
    createVariableNamesIndex,
} from './proxies'
import {
    buildFullGraphTraversal,
    buildGraphTraversalSignal,
    getGraphSignalSinks,
    getNodeImplementationsUsedInGraph,
} from '../compile-helpers'
import { PrecompilationInput, Precompilation } from './types'
import precompileDependencies, { engineMinimalDependencies } from './dependencies'
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
    precompileColdDspGroup,
} from './dsp-groups'
import { DspGroup } from './types'
import { precompileCore, precompileStateClass } from './node-implementations'
import {
    precompileIoMessageReceiver,
    precompileIoMessageSender,
    addNodeImplementationsForMessageIo,
} from './io'
import { ReadOnlyIndex } from '../proxies'

export default (precompilationInput: PrecompilationInput) => {
    const precompilation = initializePrecompilation(precompilationInput)

    // -------------------- MESSAGE IOs ------------------ //
    // In this section we will modify the graph, by adding nodes
    // for io messages. Therefore this is the very first thing that needs
    // to be done, so that these nodes are handled by the rest of the precompilation.
    addNodeImplementationsForMessageIo(precompilation.nodeImplementations)

    Object.entries(precompilationInput.settings.io.messageReceivers).forEach(
        ([specNodeId, spec]) => {
            spec.portletIds.forEach((specInletId) => {
                precompileIoMessageReceiver(
                    precompilation,
                    specNodeId,
                    specInletId
                )
            })
        }
    )

    Object.entries(precompilationInput.settings.io.messageSenders).forEach(
        ([specNodeId, spec]) => {
            spec.portletIds.forEach((specInletId) => {
                precompileIoMessageSender(
                    precompilation,
                    specNodeId,
                    specInletId
                )
            })
        }
    )

    // Remove unused nodes
    precompilation.graph = traversers.trimGraph(
        precompilation.graph,
        buildFullGraphTraversal(precompilation.graph)
    )

    // Remove unused node implementations
    precompilation.nodeImplementations = getNodeImplementationsUsedInGraph(
        precompilation.graph,
        precompilation.nodeImplementations
    )

    precompilation.precompiledCode.graph.fullTraversal =
        buildFullGraphTraversal(precompilation.graph)

    const nodes = traversers.toNodes(
        precompilation.graph,
        precompilation.precompiledCode.graph.fullTraversal
    )

    // -------------------- NODE IMPLEMENTATIONS & STATES ------------------ //
    Object.keys(precompilation.nodeImplementations).forEach((nodeType) => {
        // Run first because we might use some members declared here
        // in the state initialization.
        precompileCore(precompilation, nodeType)
        precompileStateClass(precompilation, nodeType)
    })
    nodes.forEach((node) => {
        precompileState(precompilation, node)
    })

    // ------------------------ DSP GROUPS ------------------------ //
    // These are groups of nodes that are mostly used for optimizing
    // the dsp loop :
    //  - inlining dsp calculation when this can be done, to avoid copying
    //      between variables if not needed
    //  - taking out of the loop dsp (aka hot dsp) calculations that don't
    //      need to be recomputed at every tick (aka cold dsp)
    const rootDspGroup: DspGroup = {
        traversal: buildGraphTraversalSignal(precompilation.graph),
        outNodesIds: getGraphSignalSinks(precompilation.graph).map(
            (node) => node.id
        ),
    }
    const coldDspGroups = buildColdDspGroups(precompilation, rootDspGroup)
    const hotDspGroup = buildHotDspGroup(
        precompilation,
        rootDspGroup,
        coldDspGroups
    )
    const hotAndColdDspGroups = [hotDspGroup, ...coldDspGroups]
    const inlinableDspGroups = hotAndColdDspGroups.flatMap((parentDspGroup) => {
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

    precompilation.precompiledCode.graph.hotDspGroup = hotDspGroup
    coldDspGroups.forEach((dspGroup, index) => {
        precompileColdDspGroup(precompilation, dspGroup, `${index}`)
    })

    // ------------------------ PORTLETS ------------------------ //
    // Go through the nodes and precompile inlets.
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

    // Go through the nodes and precompile message outlets.
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
    // are not inlined (inlinable nodes should have been previously removed
    // from these dsp groups).
    hotAndColdDspGroups.forEach((dspGroup) => {
        traversers
            .toNodes(precompilation.graph, dspGroup.traversal)
            .forEach((node) => {
                Object.values(node.outlets).forEach((outlet) => {
                    precompileSignalOutlet(precompilation, node, outlet.id)
                })
            })
    })

    // ------------------------ DEPENDENCIES ------------------------ //
    precompileDependencies(precompilation, engineMinimalDependencies())

    // ------------------------ NODE ------------------------ //
    inlinableDspGroups.forEach((dspGroup) => {
        precompileInlineDsp(precompilation, dspGroup)
    })

    hotAndColdDspGroups.forEach((dspGroup) => {
        traversers
            .toNodes(precompilation.graph, dspGroup.traversal)
            .forEach((node) => {
                precompileDsp(precompilation, node)
            })
    })

    // This must come after we have assigned all node variables.
    nodes.forEach((node) => {
        precompileInitialization(precompilation, node)
        precompileMessageReceivers(precompilation, node)
    })

    return precompilation
}

export const initializePrecompilation = (
    precompilationRawInput: PrecompilationInput
): Precompilation => {
    const precompilationInput: PrecompilationInput = {
        graph: { ...precompilationRawInput.graph },
        nodeImplementations: { ...precompilationRawInput.nodeImplementations },
        settings: precompilationRawInput.settings,
    }
    const precompiledCode = createPrecompiledCode(precompilationInput)
    const variableNamesIndex = createVariableNamesIndex(precompilationInput)

    return {
        ...precompilationInput,
        precompiledCode,
        variableNamesIndex,
        variableNamesAssigner: VariableNamesAssigner({
            variableNamesIndex,
            input: precompilationInput,
        }),
        variableNamesReadOnly: ReadOnlyIndex(variableNamesIndex),
        precompiledCodeAssigner: PrecompiledCodeAssigner({
            precompiledCode,
            input: precompilationInput,
        }),
    }
}
