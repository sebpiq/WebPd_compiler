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
import { assertFuncSignatureEqual } from '../../ast/ast-helpers'
import { AnonFunc, Var, ast } from '../../ast/declare'
import render from '../render'
import { Code } from '../../ast/types'
import { DspGraph, getters } from '../../dsp-graph'
import { mapArray } from '../../functional-helpers'
import { getMacros } from '../compile-helpers'
import { PrecompileNodeNamespace } from '../proxies'
import { DspGroup, Precompilation, PrecompiledNodeCode } from './types'

type InlinedNodes = { [nodeId: DspGraph.NodeId]: Code }
type InlinedInputs = { [inletId: DspGraph.PortletId]: Code }

const MESSAGE_RECEIVER_SIGNATURE = AnonFunc([Var('Message', 'm')], 'void')``

export const precompileState = (
    {
        input: { settings },
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    node: DspGraph.Node
) => {
    const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
    const precompiledNodeImplementation =
        precompiledCodeAssigner.nodeImplementations[precompiledNode.nodeType]!
    if (precompiledNodeImplementation.nodeImplementation.state) {
        const nodeType = node.type
        const stateClassName =
            variableNamesAssigner.nodeImplementations[nodeType]!.stateClass
        if (!stateClassName) {
            throw new Error(`No stateClass defined for ${nodeType}`)
        }
        const astClass = precompiledNodeImplementation.nodeImplementation.state(
            {
                globs: variableNamesAssigner.globs,
                node,
                settings,
                stateClassName,
            }
        )

        // Add state iniialization to the node.
        precompiledNode.state = {
            name: variableNamesAssigner.nodes[node.id]!.state!,
            initialization: astClass.members.reduce(
                (stateInitialization, astVar) => ({
                    ...stateInitialization,
                    [astVar.name]: astVar.value,
                }),
                {}
            ),
        }
    }
}

/**
 * This needs to be in a separate function as `precompileMessageInlet`, because we need
 * all portlet variable names defined before we can precompile message receivers.
 */
export const precompileMessageReceivers = (
    {
        input: { settings },
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    node: DspGraph.Node
) => {
    const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
    const precompiledNodeImplementation =
        precompiledCodeAssigner.nodeImplementations[precompiledNode.nodeType]!
    const { state, snds } = _getContext(node.id, precompiledNode)
    const messageReceivers = PrecompileNodeNamespace(
        precompiledNodeImplementation.nodeImplementation.messageReceivers
            ? precompiledNodeImplementation.nodeImplementation.messageReceivers(
                  {
                      globs: variableNamesAssigner.globs,
                      state,
                      snds,
                      node,
                      settings,
                  }
              )
            : {},
        node.id,
        'messageReceivers'
    )

    Object.keys(precompiledNode.messageReceivers).forEach((inletId) => {
        const implementedFunc = messageReceivers[inletId]!
        assertFuncSignatureEqual(implementedFunc, MESSAGE_RECEIVER_SIGNATURE)
        const targetFunc = precompiledNode.messageReceivers[inletId]!

        // We can't override values in the namespace, so we need to copy
        // the function's properties one by one.
        targetFunc.name =
            variableNamesAssigner.nodes[node.id]!.messageReceivers[inletId]!
        targetFunc.args = implementedFunc.args
        targetFunc.body = implementedFunc.body
        targetFunc.returnType = implementedFunc.returnType
    })
}

export const precompileInitialization = (
    {
        input: { settings },
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    node: DspGraph.Node
) => {
    const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
    const precompiledNodeImplementation =
        precompiledCodeAssigner.nodeImplementations[precompiledNode.nodeType]!
    const { state, snds } = _getContext(node.id, precompiledNode)
    precompiledNode.initialization = precompiledNodeImplementation
        .nodeImplementation.initialization
        ? precompiledNodeImplementation.nodeImplementation.initialization({
              globs: variableNamesAssigner.globs,
              state,
              snds,
              node,
              settings,
          })
        : ast``
}

export const precompileDsp = (
    {
        input: { settings },
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    node: DspGraph.Node
) => {
    const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
    const precompiledNodeImplementation =
        precompiledCodeAssigner.nodeImplementations[precompiledNode.nodeType]!
    const { outs, ins, snds, state } = _getContext(node.id, precompiledNode)

    if (!precompiledNodeImplementation.nodeImplementation.dsp) {
        throw new Error(`No dsp to generate for node ${node.type}:${node.id}`)
    }

    const compiledDsp = precompiledNodeImplementation.nodeImplementation.dsp({
        globs: variableNamesAssigner.globs,
        node,
        state,
        ins,
        outs,
        snds,
        settings,
    })

    // Nodes that come here might have inlinable dsp, but still can't
    // be inlined because, for example, they have 2 sinks.
    if (
        precompiledNodeImplementation.nodeImplementation.flags &&
        precompiledNodeImplementation.nodeImplementation.flags.isDspInline
    ) {
        if ('loop' in compiledDsp) {
            throw new Error(
                `Invalid dsp definition for inlinable node ${node.type}:${node.id}`
            )
        }
        const outletId = Object.keys(node.outlets)[0]!
        precompiledNode.dsp.loop = ast`${variableNamesAssigner.nodes[node.id]!
            .signalOuts[outletId]!} = ${compiledDsp}`
    } else if ('loop' in compiledDsp) {
        precompiledNode.dsp.loop = compiledDsp.loop
        Object.entries(compiledDsp.inlets).forEach(
            ([inletId, precompiledDspForInlet]) => {
                precompiledNode.dsp.inlets[inletId] = precompiledDspForInlet
            }
        )
    } else {
        precompiledNode.dsp.loop = compiledDsp
    }
}

/**
 * Inlines a dsp group of inlinable nodes into a single string.
 * That string is then injected as signal input to the sink of our dsp group.
 * e.g. :
 *
 * ```
 *          [  n1  ]      <-  inlinable dsp group
 *               \          /
 *    [  n2  ]  [  n3  ]  <-
 *      \        /
 *       \      /
 *        \    /
 *       [  n4  ]  <- out node for the dsp group
 *           |
 *       [  n5  ]  <- non-inlinable node, sink of the group
 *
 * ```
 */
export const precompileInlineDsp = (
    {
        input: { graph, settings },
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    dspGroup: DspGroup
): void => {
    const inlinedNodes = dspGroup.traversal.reduce<InlinedNodes>(
        (inlinedNodes, nodeId) => {
            const precompiledNode = precompiledCodeAssigner.nodes[nodeId]!
            const precompiledNodeImplementation =
                precompiledCodeAssigner.nodeImplementations[
                    precompiledNode.nodeType
                ]!
            const { ins, outs, snds, state } = _getContext(
                nodeId,
                precompiledNode
            )
            const node = getters.getNode(graph, nodeId)
            const inlinedInputs: InlinedInputs = mapArray(
                // Select signal inlets with sources
                Object.values(node.inlets)
                    .map(
                        (inlet) =>
                            [inlet, getters.getSources(node, inlet.id)] as const
                    )
                    .filter(
                        ([inlet, sources]) =>
                            inlet.type === 'signal' &&
                            sources.length > 0 &&
                            // We filter out sources that are not inlinable.
                            // These sources will just be represented by their outlet's
                            // variable name.
                            dspGroup.traversal.includes(sources[0]!.nodeId)
                    ),

                // Build map of inlined inputs
                ([inlet, sources]) => {
                    // Because it's a signal connection, we have only one source per inlet
                    const source = sources[0]!
                    if (!(source.nodeId in inlinedNodes)) {
                        throw new Error(
                            `Unexpected error : inlining failed, missing inlined source ${source.nodeId}`
                        )
                    }
                    return [inlet.id, inlinedNodes[source.nodeId]!]
                }
            )

            if (!precompiledNodeImplementation.nodeImplementation.dsp) {
                throw new Error(
                    `No dsp to generate for node ${node.type}:${node.id}`
                )
            }

            const compiledDsp =
                precompiledNodeImplementation.nodeImplementation.dsp({
                    globs: variableNamesAssigner.globs,
                    state,
                    ins: PrecompileNodeNamespace(
                        {
                            ...ins,
                            ...inlinedInputs,
                        },
                        nodeId,
                        'ins'
                    ),
                    outs,
                    snds,
                    node,
                    settings,
                })

            if (!('astType' in compiledDsp)) {
                throw new Error(`Inlined dsp can only be an AstSequence`)
            }

            return {
                ...inlinedNodes,
                [nodeId]:
                    '(' + render(getMacros(settings.target), compiledDsp) + ')',
            }
        },
        {}
    )

    const groupSinkNode = _getInlinableGroupSinkNode(graph, dspGroup)
    precompiledCodeAssigner.nodes[groupSinkNode.nodeId]!.signalIns[
        groupSinkNode.portletId
    ] = inlinedNodes[dspGroup.outNodesIds[0]!]!
}

const _getContext = (
    nodeId: DspGraph.NodeId,
    precompiledNode: PrecompiledNodeCode
) => ({
    state: precompiledNode.state ? precompiledNode.state.name : '',
    ins: PrecompileNodeNamespace(precompiledNode.signalIns, nodeId, 'ins'),
    outs: PrecompileNodeNamespace(precompiledNode.signalOuts, nodeId, 'outs'),
    snds: PrecompileNodeNamespace(
        Object.entries(precompiledNode.messageSenders).reduce(
            (snds, [outletId, { messageSenderName }]) => ({
                ...snds,
                [outletId]: messageSenderName,
            }),
            {}
        ),
        nodeId,
        'snds'
    ),
    rcvs: PrecompileNodeNamespace(
        Object.entries(precompiledNode.messageReceivers).reduce(
            (rcvs, [inletId, astFunc]) => ({
                ...rcvs,
                [inletId]: astFunc.name,
            }),
            {}
        ),
        nodeId,
        'rcvs'
    ),
})

const _getInlinableGroupSinkNode = (
    graph: DspGraph.Graph,
    dspGroup: DspGroup
) => {
    const groupOutNode = getters.getNode(graph, dspGroup.outNodesIds[0]!)
    return Object.entries(groupOutNode.sinks).find(([outletId]) => {
        const outlet = getters.getOutlet(groupOutNode, outletId)
        return outlet.type === 'signal'
    })![1][0]!
}
