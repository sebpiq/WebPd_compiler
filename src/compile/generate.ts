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
    Precompilation,
    GlobalCodeDefinitionExport,
    Compilation,
} from './types'
import { AstConstVar, AstFunc, AstSequence, VariableName } from '../ast/types'
import { Sequence, Func, Var, ast, ConstVar } from '../ast/declare'
import { DspGraph } from '../dsp-graph'
import {
    findColdDspGroupFromSink,
    isNodeInsideGroup,
} from './precompile/dsp-groups'

export const generateGlobs = ({
    variableNamesIndex: { globs },
}: Precompilation): AstSequence =>
    // prettier-ignore
    Sequence([
        Var('Int', globs.iterFrame, '0'),
        Var('Int', globs.frame, '0'),
        Var('Int', globs.blockSize, '0'),
        Var('Float', globs.sampleRate, '0'),
        Var('Float', globs.nullSignal, '0'),
        Func(globs.nullMessageReceiver, [
            Var('Message', 'm')
        ], 'void')``,
        Var('Message', globs.emptyMessage, 'msg_create([])'),
    ])

/**
 * Embed arrays passed to the compiler in the compiled module.
 */
export const generateEmbeddedArrays = ({ arrays }: Compilation['settings']) =>
    Sequence(
        Object.entries(arrays).map(([arrayName, array]) =>
            Sequence([
                `commons_setArray("${arrayName}", createFloatArray(${array.length}))`,
                `commons_getArray("${arrayName}").set(${JSON.stringify(
                    Array.from(array)
                )})`,
            ])
        )
    )

export const generateNodeImplementationsCoreAndStateClasses = ({
    nodeImplementations,
}: Precompilation): AstSequence =>
    Sequence(
        Object.values(nodeImplementations).map((precompiledImplementation) => [
            precompiledImplementation.stateClass,
            precompiledImplementation.core,
        ])
    )

export const generateNodeStateInstances = ({
    variableNamesIndex,
    graph,
    nodes,
}: Precompilation): AstSequence =>
    Sequence([
        graph.fullTraversal.reduce<Array<AstConstVar>>(
            (declarations, nodeId) => {
                const precompiledNode = nodes[nodeId]
                const nodeVariableNames = variableNamesIndex.nodes[nodeId]
                if (!precompiledNode.state) {
                    return declarations
                } else {
                    return [
                        ...declarations,
                        ConstVar(
                            precompiledNode.state.className,
                            nodeVariableNames.state,
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

export const generateNodeInitializations = ({
    graph,
    nodes,
}: Precompilation): AstSequence =>
    Sequence([
        graph.fullTraversal.map((nodeId) => nodes[nodeId].initialization),
    ])

export const generateIoMessageReceivers = (
    { variableNamesIndex, graph }: Precompilation,
    { io }: Compilation['settings']
): AstSequence =>
    Sequence(
        Object.entries(io.messageReceivers).map(([nodeId, spec]) => {
            // TODO : todo-io-messageReceivers This lookup should be done in precompile
            const groupsContainingSink = Object.entries(graph.coldDspGroups)
                .filter(([_, dspGroup]) => isNodeInsideGroup(dspGroup, nodeId))
                .map(([groupId]) => groupId)

            const coldDspFunctionNames = groupsContainingSink.map(
                (groupId) => variableNamesIndex.coldDspGroups[groupId]
            )
            // END TODO

            return spec.portletIds.map(
                (inletId) =>
                    Func(
                        variableNamesIndex.io.messageReceivers[nodeId][inletId],
                        [Var('Message', 'm')],
                        'void'
                    )`
                        ${
                            variableNamesIndex.nodes[nodeId].messageReceivers[
                                inletId
                            ]
                        }(m)
                        ${coldDspFunctionNames.map((name) => `${name}(m)`)}
                    `
            )
        })
    )

export const generateIoMessageSenders = (
    { variableNamesIndex }: Precompilation,
    { io }: Compilation['settings'],
    generateIoMessageSender: (
        variableName: VariableName,
        nodeId: DspGraph.NodeId,
        outletId: DspGraph.PortletId
    ) => AstSequence
) =>
    Sequence(
        Object.entries(io.messageSenders).map(([nodeId, spec]) =>
            spec.portletIds.map((outletId) => {
                const listenerVariableName =
                    variableNamesIndex.io.messageSenders[nodeId][outletId]
                return generateIoMessageSender(
                    listenerVariableName,
                    nodeId,
                    outletId
                )
            })
        )
    )

export const generatePortletsDeclarations = (
    { graph, nodes }: Precompilation,
    { debug }: Compilation['settings']
): AstSequence =>
    Sequence([
        graph.fullTraversal
            .map((nodeId) => [nodes[nodeId], nodeId] as const)
            .map(([precompiledNode, nodeId]) => [
                // 1. Declares signal outlets
                Object.values(precompiledNode.signalOuts).map((outName) =>
                    Var('Float', outName, '0')
                ),

                // 2. Declares message receivers for all message inlets.
                Object.entries(precompiledNode.messageReceivers).map(
                    ([inletId, astFunc]) => {
                        // prettier-ignore
                        return Func(astFunc.name, astFunc.args, astFunc.returnType)`
                            ${astFunc.body}
                            throw new Error('Node "${nodeId}", inlet "${inletId}", unsupported message : ' + msg_display(${astFunc.args[0].name})${
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
            .flatMap((nodeId) => Object.values(nodes[nodeId].messageSenders))
            .map(
                ({ messageSenderName: sndName, functionNames }) =>
                    // prettier-ignore
                    Func(sndName, [
                        Var('Message', 'm')
                    ], 'void')`
                        ${functionNames.map(functionName => 
                            `${functionName}(m)`)}
                    `
            ),
    ])

export const generateLoop = ({
    variableNamesIndex,
    nodes,
    graph: { hotDspGroup, coldDspGroups },
}: Precompilation) => {
    const { globs } = variableNamesIndex

    // prettier-ignore
    return ast`
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            _commons_emitFrame(${globs.frame})
            ${hotDspGroup.traversal.map((nodeId) => {
                const precompiledNode = nodes[nodeId]
                return [
                    // For all caching functions, we render those that are not
                    // the sink of a cold dsp group.
                    ...Object.entries(precompiledNode.caching)
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
                    precompiledNode.loop
                ]
            })}
            ${globs.frame}++
        }
    `
}

export const generateColdDspInitialization = ({
    variableNamesIndex,
    graph,
}: Precompilation) =>
    Sequence(
        Object.keys(graph.coldDspGroups).map(
            (groupId) =>
                `${variableNamesIndex.coldDspGroups[groupId]}(${variableNamesIndex.globs.emptyMessage})`
        )
    )

export const generateColdDspFunctions = ({
    variableNamesIndex,
    graph: { coldDspGroups },
    nodes,
}: Precompilation): AstSequence =>
    Sequence(
        Object.entries(coldDspGroups).map(([groupId, dspGroup]) => {
            const funcName = variableNamesIndex.coldDspGroups[groupId]
            // prettier-ignore
            return Func(funcName, [Var('Message', 'm')], 'void')`
                ${dspGroup.traversal.map((nodeId) => 
                    nodes[nodeId].loop
                )}
                ${dspGroup.sinkConnections
                    .filter(([_, sink]) => sink.portletId in nodes[sink.nodeId].caching)
                    .map(([_, sink]) => 
                        nodes[sink.nodeId].caching[sink.portletId]
                    )
                }
            `
        })
    )

export const generateImportsExports = (
    { dependencies }: Precompilation,
    generateImport: (imprt: AstFunc) => AstSequence,
    generateExport: (xprt: GlobalCodeDefinitionExport) => AstSequence
): AstSequence =>
    Sequence([
        dependencies.imports.map(generateImport),
        dependencies.exports.map(generateExport),
    ])
