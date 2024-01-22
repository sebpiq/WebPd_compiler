import { DspGraph, traversers } from '../../dsp-graph'
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

    // Go through all nodes in the signal traversal, and find groups of signal nodes
    // that can be cached / computed only when needed (cold dsp), outside 
    // of the main dsp loop (hot dsp). We proceed in the following way :
    // 1. Find single flow dsp groups, i.e. a cold node and all its sources, 
    //      and their sources, etc. as long as all nodes are cold.
    // 2. some of these single flow dsp groups might be connected to each other,
    //      therefore we need to merge them.
    // 3. for each merged group consolidate the signal traversal, therefore 
    //      fixing the order in which nodes are visited and removing potential duplicates.
    // 
    // e.g. :
    // 
    //      [  c1  ]      
    //         |\________ 
    //         |         |
    //      [  c2  ]  [  c4  ]
    //         |         |
    //      [  c3  ]  [  c5  ]  <- out nodes of cold the cold dsp group
    //         |         |
    //      [  h1  ]  [  h2  ]  <- hot nodes  
    // 
    // In the graph above, [c1, c2, c3, c4, c5] constitute a cold dsp group.
    // 1. We start by finding 2 single flow dsp groups : [c3, c2, c1] and [c5, c4, c1]
    // 2. We detect that these 2 groups are connected, so we merge them into one group : [c3, c2, c1, c5, c4, c1]
    // 3. ...
    return (
        _buildSingleFlowColdDspGroups(compilation, parentDspGroup)
            // Combine all connected single flow dsp groups.
            .reduce<Array<DspGroup>>((dspGroups, singleFlowDspGroup) => {
                const groupToMergeInto = dspGroups.find((otherGroup) =>
                    otherGroup.traversal.some((nodeId) =>
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
                traversal: traversers.signalNodes(
                    graph,
                    traversers.toNodes(graph, dspGroup.outNodesIds)
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
    return traversers
        .toNodes(graph, parentDspGroup.traversal)
        .reduce<Array<DspGroup>>((dspGroups, node) => {
            // If one of `node`'s sinks is a also cold, then `node` is not the
            // out node of a dsp group.
            if (
                !_isNodeDspCold(compilation, node) ||
                traversers
                    .listSignalSinkNodes(graph, node)
                    .every((sinkNode) => _isNodeDspCold(compilation, sinkNode))
            ) {
                return dspGroups
            }

            // We need to check that all upstream nodes are also cold.
            let areAllSourcesCold = true
            const dspGroup: DspGroup = {
                outNodesIds: [node.id],
                traversal: traversers.signalNodes(
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
    return traversers
        .toNodes(graph, parentDspGroup.traversal)
        .reduce<Array<DspGroup>>((dspGroups, node) => {
            const sinkNodes = traversers.listSignalSinkNodes(graph, node)
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
                        traversal: traversers.signalNodes(
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
    traversal: DspGraph.GraphTraversal,
    toRemove: Array<DspGraph.NodeId>
) => traversal.filter((nodeId) => !toRemove.includes(nodeId))

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
    const sinkNodes = traversers.listSignalSinkNodes(graph, node)
    return (
        !!precompilation.nodes[node.id].nodeImplementation.inlineLoop &&
        sinkNodes.length === 1
    )
}
