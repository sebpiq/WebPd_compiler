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

import { DspGraph } from './types'

export const getNode = (
    graph: DspGraph.Graph,
    nodeId: DspGraph.NodeId
): DspGraph.Node => {
    const node = graph[nodeId]
    if (node) {
        return node
    }
    throw new Error(`Node "${nodeId}" not found in graph`)
}

export const getInlet = (
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
): DspGraph.Portlet => {
    const inlet = node.inlets[inletId]
    if (inlet) {
        return inlet
    }
    throw new Error(`Inlet "${inletId}" not found in node ${node.id}`)
}

export const getOutlet = (
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
): DspGraph.Portlet => {
    const outlet = node.outlets[outletId]
    if (outlet) {
        return outlet
    }
    throw new Error(`Outlet "${outletId}" not found in node ${node.id}`)
}

/** Returns the list of sinks for the outlet or an empty list. */
export const getSinks = (
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
): ReadonlyArray<DspGraph.ConnectionEndpoint> => node.sinks[outletId] || []

/** Returns the list of sources for the inlet or an empty list. */
export const getSources = (
    node: DspGraph.Node,
    inletId: DspGraph.PortletId
): ReadonlyArray<DspGraph.ConnectionEndpoint> => node.sources[inletId] || []
