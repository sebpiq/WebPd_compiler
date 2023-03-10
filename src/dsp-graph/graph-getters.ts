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
    throw new Error(`Inlet "${inletId}" not found in node ${node.id} of type ${node.type}`)
}

export const getOutlet = (
    node: DspGraph.Node,
    outletId: DspGraph.PortletId
): DspGraph.Portlet => {
    const outlet = node.outlets[outletId]
    if (outlet) {
        return outlet
    }
    throw new Error(`Outlet "${outletId}" not found in node ${node.id} of type ${node.type}`)
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
