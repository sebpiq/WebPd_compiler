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
import {
    AstConstVar,
    AstFunc,
    AstSequence,
    VariableName,
} from '../../ast/types'
import { Sequence, Func, Var, ast, ConstVar } from '../../ast/declare'
import { DspGraph } from '../../dsp-graph'
import { findColdDspGroupFromSink } from '../precompile/dsp-groups'
import { RenderTemplateInput } from './types'

const dependencies = ({ precompiledCode }: RenderTemplateInput) =>
    precompiledCode.dependencies.ast

const nodeImplementationsCoreAndStateClasses = ({
    precompiledCode: { nodeImplementations },
}: RenderTemplateInput): AstSequence =>
    Sequence(
        Object.values(nodeImplementations).map((precompiledImplementation) => [
            precompiledImplementation.stateClass,
            precompiledImplementation.core,
        ])
    )

const nodeStateInstances = ({
    precompiledCode: { graph, nodes, nodeImplementations },
}: RenderTemplateInput): AstSequence =>
    Sequence([
        graph.fullTraversal.reduce<Array<AstConstVar>>(
            (declarations, nodeId) => {
                const precompiledNode = nodes[nodeId]!
                const precompiledNodeImplementation =
                    nodeImplementations[precompiledNode.nodeType]!
                if (!precompiledNode.state) {
                    return declarations
                } else {
                    if (!precompiledNodeImplementation.stateClass) {
                        throw new Error(
                            `Node "${nodeId}" of type ${precompiledNode.nodeType} has a state but no state class`
                        )
                    }
                    return [
                        ...declarations,
                        ConstVar(
                            precompiledNodeImplementation.stateClass.name,
                            precompiledNode.state.name,
                            ast`{
                                ${Object.entries(
                                    precompiledNode.state.initialization
                                ).map(([key, value]) => ast`${key}: ${value},`)}
                            }`
                        ),
                    ]
                }
            },
            []
        ),
    ])

const nodeInitializations = ({
    precompiledCode: { graph, nodes },
}: RenderTemplateInput): AstSequence =>
    Sequence([
        graph.fullTraversal.map((nodeId) => nodes[nodeId]!.initialization),
    ])

const ioMessageReceivers = ({
    globalCode,
    precompiledCode: { io },
}: RenderTemplateInput): AstSequence =>
    Sequence(
        Object.values(io.messageReceivers).map((inletsMap) => {
            return Object.values(inletsMap).map(
                (precompiledIoMessageReceiver) => {
                    // prettier-ignore
                    return Func(precompiledIoMessageReceiver.functionName, [
                    Var(globalCode.msg!.Message!, 'm')
                ], 'void')`
                    ${precompiledIoMessageReceiver.getSinkFunctionName()}(m)
                `
                }
            )
        })
    )

const ioMessageSenders = (
    { precompiledCode }: RenderTemplateInput,
    generateIoMessageSender: (
        variableName: VariableName,
        nodeId: DspGraph.NodeId,
        outletId: DspGraph.PortletId
    ) => AstSequence
) =>
    Sequence(
        Object.entries(precompiledCode.io.messageSenders).map(
            ([nodeId, portletIdsMap]) =>
                Object.entries(portletIdsMap).map(
                    ([outletId, messageSender]) => {
                        return generateIoMessageSender(
                            messageSender.functionName,
                            nodeId,
                            outletId
                        )
                    }
                )
        )
    )

const portletsDeclarations = ({
    globalCode,
    precompiledCode: { graph, nodes },
    settings: { debug },
}: RenderTemplateInput): AstSequence =>
    Sequence([
        graph.fullTraversal
            .map((nodeId) => [nodes[nodeId]!, nodeId] as const)
            .map(([precompiledNode, nodeId]) => [
                // 1. Declares signal outlets
                Object.values(precompiledNode.signalOuts).map((outName) =>
                    Var('Float', outName, '0')
                ),

                // 2. Declares message receivers for all message inlets.
                Object.entries(precompiledNode.messageReceivers).map(
                    ([inletId, astFunc]) => {
                        // prettier-ignore
                        return Func(astFunc.name!, astFunc.args, astFunc.returnType)`
                            ${astFunc.body}
                            throw new Error('Node "${nodeId}", inlet "${inletId}", unsupported message : ' + ${globalCode.msg!.display!}(${astFunc.args[0]!.name})${
                                debug
                                    ? " + '\\nDEBUG : remember, you must return from message receiver'"
                                    : ''})
                        `
                    }
                ),
            ]),

        // 3. Declares message senders for all message outlets.
        // This needs to come after all message receivers are declared since we reference them here.
        graph.fullTraversal
            .flatMap((nodeId) => Object.values(nodes[nodeId]!.messageSenders))
            // If only one sink declared, we don't need to declare the messageSender,
            // as precompilation takes care of substituting the messageSender name
            // with the sink name.
            .filter(({ sinkFunctionNames }) => sinkFunctionNames.length > 0)
            .map(
                ({ messageSenderName, sinkFunctionNames }) =>
                    // prettier-ignore
                    Func(messageSenderName, [
                        Var(globalCode.msg!.Message!, 'm')
                    ], 'void')`
                        ${sinkFunctionNames.map(functionName => 
                            `${functionName}(m)`)}
                    `
            ),
    ])

const dspLoop = ({
    globalCode,
    precompiledCode: {
        nodes,
        graph: { hotDspGroup, coldDspGroups },
    },
}: RenderTemplateInput) =>
    // prettier-ignore
    ast`
        for (${globalCode.core!.IT_FRAME!} = 0; ${globalCode.core!.IT_FRAME!} < ${globalCode.core!.BLOCK_SIZE!}; ${globalCode.core!.IT_FRAME!}++) {
            ${globalCode.commons!._emitFrame!}(${globalCode.core!.FRAME!})
            ${hotDspGroup.traversal.map((nodeId) => [
                // For all inlets dsp functions, we render those that are not
                // the sink of a cold dsp group.
                ...Object.entries(nodes[nodeId]!.dsp.inlets)
                    .filter(([inletId]) => 
                        findColdDspGroupFromSink(
                            coldDspGroups, { 
                                nodeId, 
                                portletId: inletId 
                            }
                        ) === undefined)
                    .map(([_, astElement]) => 
                        astElement
                    ),
                nodes[nodeId]!.dsp.loop
            ])}
            ${globalCode.core!.FRAME!}++
        }
    `

const coldDspInitialization = ({
    globalCode,
    precompiledCode: { graph },
}: RenderTemplateInput) =>
    Sequence(
        Object.values(graph.coldDspGroups).map(
            ({ functionName }) => `${functionName}(${globalCode.msg!.emptyMessage!})`
        )
    )

const coldDspFunctions = ({
    globalCode,
    precompiledCode: {
        graph: { coldDspGroups },
        nodes,
    },
}: RenderTemplateInput): AstSequence =>
    Sequence(
        Object.values(coldDspGroups).map(
            ({
                dspGroup,
                sinkConnections: dspGroupSinkConnections,
                functionName,
            }) =>
                // prettier-ignore
                Func(functionName, [
                    Var(globalCode.msg!.Message!, 'm')
                ], 'void')`
                    ${dspGroup.traversal.map((nodeId) => 
                        nodes[nodeId]!.dsp.loop
                    )}
                    ${dspGroupSinkConnections
                    // For all sinks of the cold dsp group, we also render 
                    // the inlets dsp functions that are connected to it. 
                        .filter(([_, sink]) => 
                            sink.portletId in nodes[sink.nodeId]!.dsp.inlets
                        )
                        .map(([_, sink]) => 
                            nodes[sink.nodeId]!.dsp.inlets[sink.portletId]!
                        )
                    }
                `
        )
    )

const importsExports = (
    { precompiledCode: { dependencies } }: RenderTemplateInput,
    generateImport: (imprt: AstFunc) => AstSequence,
    generateExport: (xprt: VariableName) => AstSequence
): AstSequence =>
    Sequence([
        dependencies.imports.map(generateImport),
        dependencies.exports.map(generateExport),
    ])

export default {
    dependencies,
    nodeImplementationsCoreAndStateClasses,
    nodeStateInstances,
    nodeInitializations,
    ioMessageReceivers,
    ioMessageSenders,
    portletsDeclarations,
    dspLoop,
    coldDspInitialization,
    coldDspFunctions,
    importsExports,
}
