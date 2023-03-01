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

    type Graph = { [nodeId: string]: Node }

    type Arrays = { [arrayName: string]: Float32Array }

    type GraphTraversal = Array<NodeId>
}
