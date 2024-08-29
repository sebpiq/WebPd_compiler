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

export declare module DspGraph {
    // !!! Characters here should only be [a-zA-Z0-9_] because the code generation (WebPd_copmiler-js)
    // will only support these.
    type NodeId = string

    type NodeType = string

    type NodeArgument = string | number

    type NodeArguments = {
        [argumentName: string]: any
    }

    type PortletId = string

    type PortletType = 'signal' | 'message'

    interface ConnectionEndpoint {
        readonly nodeId: NodeId
        readonly portletId: PortletId
    }

    interface Portlet {
        readonly id: PortletId
        readonly type: PortletType
    }

    type PortletMap = {
        [portletId: string]: Portlet
    }

    type ConnectionEndpointMap = {
        [portletId: string]: Array<ConnectionEndpoint>
    }

    interface Node<NodeArgsType = NodeArguments> {
        readonly id: NodeId
        readonly type: NodeType
        readonly args: NodeArgsType
        readonly sources: ConnectionEndpointMap
        readonly sinks: ConnectionEndpointMap
        readonly inlets: PortletMap
        readonly outlets: PortletMap

        /**
         * When true, the node will pull sound through the signal graph.
         * This value is used for signal graph traversal.
         */
        readonly isPullingSignal?: true

        /**
         * When true, the node will push messages through the message graph.
         * This value is used for signal graph traversal.
         */
        readonly isPushingMessages?: true
    }

    type Graph = { [nodeId: NodeId]: Node }

    type Arrays = { [arrayName: string]: Float32Array }

    type GraphTraversal = Array<NodeId>

    type Connection = [DspGraph.ConnectionEndpoint, DspGraph.ConnectionEndpoint]
}
