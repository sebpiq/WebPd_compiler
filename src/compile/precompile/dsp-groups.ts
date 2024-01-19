import { DspGraph, traversal } from '../../dsp-graph'
import { buildGraphTraversalSignal } from '../compile-helpers'
import { DspGroup } from '../types'
import { Compilation } from '../types'

export const buildHotDspGroup = (
    { graph }: Compilation,
    parentDspGroup: DspGroup,
    coldDspGroups: Array<DspGroup>
): DspGroup => ({
    traversal: coldDspGroups.reduce(
        (traversal, coldDspGroup) =>
            removeNodesFromTraversal(traversal, coldDspGroup.traversal),
        buildGraphTraversalSignal(graph)
    ),
    outNodesIds: parentDspGroup.outNodesIds,
})

export const buildColdDspGroups = (
    compilation: Compilation,
    parentDspGroup: DspGroup
): Array<DspGroup> => {
    const { graph } = compilation

    // Go through all nodes in the signal traversal, and find signal subgraphs
    // that can be cached / computed only when needed (cold dsp), outside 
    // of the main dsp loop (hot dsp).
    // We proceed in the following way :
    // 1. Find single flow dsp groups, i.e. a cold node and all its sources, 
    //      and their sources, etc. as long as all nodes are cold.
    // 2. some of these single flow dsp groups might be connected to each other,
    //      therefore we need to merge them.
    // 3. for each merged group consolidate the signal traversal, therefore 
    //      fixing the order in which nodes are visited and removing potential duplicates.
    // 
    return (
        _buildSingleFlowColdDspGroups(compilation, parentDspGroup)
            // Combine all connected single flow dsp groups.
            // TODO : visual schemas
            .reduce<Array<DspGroup>>((dspGroups, singleFlowDspGroup) => {
                const groupToMergeInto = dspGroups.find((otherSubgraph) =>
                    otherSubgraph.traversal.some((nodeId) =>
                        singleFlowDspGroup.traversal.includes(nodeId)
                    )
                )
                if (groupToMergeInto) {
                    return [
                        ...dspGroups.filter(
                            (dspGroup) => dspGroup !== groupToMergeInto
                        ),
                        // Merging here is incomplete, we don't recompute the traversal
                        // and don't remove the duplicate nodes until all groups are combined.
                        {
                            traversal: [
                                ...groupToMergeInto.traversal,
                                ...singleFlowDspGroup.traversal,
                            ],
                            outNodesIds: [
                                ...groupToMergeInto.outNodesIds,
                                ...singleFlowDspGroup.outNodesIds,
                            ],
                        },
                    ]
                } else {
                    return [...dspGroups, singleFlowDspGroup]
                }
            }, [])

            // Compute the signal traversal, therefore fixing the order in which
            // nodes are visited and removing potential duplicates.
            .map<DspGroup>((dspGroup) => ({
                traversal: traversal.signalNodes(
                    graph,
                    traversal.toNodes(graph, dspGroup.outNodesIds)
                ),
                outNodesIds: dspGroup.outNodesIds,
            }))
    )
}

export const _buildSingleFlowColdDspGroups = (
    compilation: Compilation,
    parentDspGroup: DspGroup
): Array<DspGroup> => {
    const { graph } = compilation
    return traversal
        .toNodes(graph, parentDspGroup.traversal)
        .reduce<Array<DspGroup>>((dspGroups, node) => {
            // If one of `node`'s sinks is a also cold, then `node` is not the
            // out node of a dsp group.
            if (
                !_isNodeDspCold(compilation, node) ||
                traversal
                    .listSignalSinkNodes(graph, node)
                    .every((sinkNode) => _isNodeDspCold(compilation, sinkNode))
            ) {
                return dspGroups
            }

            // We need to check that all upstream nodes are also cold.
            let areAllSourcesCold = true
            const dspGroup: DspGroup = {
                outNodesIds: [node.id],
                traversal: traversal.signalNodes(
                    graph,
                    [node],
                    (sourceNode) => {
                        areAllSourcesCold =
                            areAllSourcesCold &&
                            _isNodeDspCold(compilation, sourceNode)
                        return areAllSourcesCold
                    }
                ),
            }

            if (areAllSourcesCold) {
                return [...dspGroups, dspGroup]
            } else {
                return dspGroups
            }
        }, [])
}

export const buildInlinableDspGroups = (
    compilation: Compilation,
    parentDspGroup: DspGroup
): Array<DspGroup> => {
    const { graph } = compilation
    return traversal
        .toNodes(graph, parentDspGroup.traversal)
        .reduce<Array<DspGroup>>((dspGroups, node) => {
            const sinkNodes = traversal.listSignalSinkNodes(graph, node)
            // We're looking for the out node of an inlinable dsp group.
            if (
                _isNodeDspInlinable(compilation, node) &&
                sinkNodes.length === 1 &&
                // If node is the out node of its parent dsp group, then its not inlinable, 
                // because it needs to declare output variables.
                !parentDspGroup.outNodesIds.includes(node.id) &&
                // If `node`'s sink is itself inlinable, then `node` is not the out node.
                (!_isNodeDspInlinable(compilation, sinkNodes[0]) ||
                    // However, if `node`'s sink is also is the out node of the parent group,
                    // then it can't actually be inlined, so `node` is the out node.
                    parentDspGroup.outNodesIds.includes(sinkNodes[0].id))
            ) {
                return [
                    ...dspGroups,
                    {
                        traversal: traversal.signalNodes(
                            graph,
                            [node],
                            (sourceNode) =>
                                _isNodeDspInlinable(compilation, sourceNode)
                        ),
                        outNodesIds: [node.id],
                    },
                ]
            } else {
                return dspGroups
            }
        }, [])
}

export const isNodeInsideGroup = (
    nodeId: DspGraph.NodeId,
    dspGroup: DspGroup
) => dspGroup.traversal.includes(nodeId)

export const removeNodesFromTraversal = (
    graphTraversal: DspGraph.GraphTraversal,
    toRemove: Array<DspGraph.NodeId>
) => graphTraversal.filter((nodeId) => !toRemove.includes(nodeId))

const _isNodeDspCold = (
    { precompilation }: Compilation,
    node: DspGraph.Node
) => {
    const nodeImplementation = precompilation.nodes[node.id].nodeImplementation
    return nodeImplementation.flags
        ? nodeImplementation.flags.isPureFunction
        : false
}

const _isNodeDspInlinable = (
    { precompilation, graph }: Compilation,
    node: DspGraph.Node
) => {
    const sinkNodes = traversal.listSignalSinkNodes(graph, node)
    return (
        !!precompilation.nodes[node.id].nodeImplementation.inlineLoop &&
        sinkNodes.length === 1
    )
}
