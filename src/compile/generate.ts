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
import { Compilation, GlobalCodeDefinitionExport } from './types'
import { AstConstVar, AstFunc, AstSequence, VariableName } from '../ast/types'
import { Sequence, Func, Var, ast, ConstVar } from '../ast/declare'
import { DspGraph } from '../dsp-graph'
import {
    findColdDspGroupFromSink,
    isNodeInsideGroup,
} from './precompile/dsp-groups'

export const generateGlobs = ({
    variableNamesIndex: { globs },
}: Compilation): AstSequence =>
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
export const generateEmbeddedArrays = ({ settings: { arrays } }: Compilation) =>
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
    precompilation,
}: Compilation): AstSequence =>
    Sequence(
        Object.values(precompilation.nodeImplementations).map(
            (precompiledImplementation) => [
                precompiledImplementation.stateClass,
                precompiledImplementation.core,
            ]
        )
    )

export const generateNodeStateInstances = ({
    precompilation,
    variableNamesIndex,
}: Compilation): AstSequence =>
    Sequence([
        precompilation.graph.fullTraversal.reduce<Array<AstConstVar>>(
            (declarations, nodeId) => {
                const precompiledNode = precompilation.nodes[nodeId]
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
                                )
                                    .map(
                                        ([key, value]) =>
                                            ast`${key}: ${value},`
                                    )}
                                }`
                        ),
                    ]
                }
            },
            []
        ),
    ])

export const generateNodeInitializations = ({
    precompilation,
}: Compilation): AstSequence =>
    Sequence([
        precompilation.graph.fullTraversal.map(
            (nodeId) => precompilation.nodes[nodeId].initialization
        ),
    ])

export const generateIoMessageReceivers = ({
    settings: { io },
    variableNamesIndex,
    precompilation,
}: Compilation): AstSequence =>
    Sequence(
        Object.entries(io.messageReceivers).map(([nodeId, spec]) => {
            // TODO : todo-io-messageReceivers This lookup should be done in precompile
            const groupsContainingSink = Object.entries(
                precompilation.graph.coldDspGroups
            )
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
    { settings: { io }, variableNamesIndex }: Compilation,
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

export const generatePortletsDeclarations = ({
    precompilation,
    settings: { debug },
}: Compilation): AstSequence =>
    Sequence([
        precompilation.graph.fullTraversal
            .map((nodeId) => [precompilation.nodes[nodeId], nodeId] as const)
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
        precompilation.graph.fullTraversal
            .flatMap((nodeId) =>
                Object.values(precompilation.nodes[nodeId].messageSenders)
            )
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
    precompilation,
}: Compilation) => {
    const {
        graph: { hotDspGroup, coldDspGroups },
    } = precompilation
    const { globs } = variableNamesIndex

    // prettier-ignore
    return ast`
        for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
            _commons_emitFrame(${globs.frame})
            ${hotDspGroup.traversal.map((nodeId) => {
                const precompiledNode = precompilation.nodes[nodeId]
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
    precompilation,
    variableNamesIndex,
}: Compilation) =>
    Sequence(
        Object.keys(precompilation.graph.coldDspGroups).map(
            (groupId) =>
                `${variableNamesIndex.coldDspGroups[groupId]}(${variableNamesIndex.globs.emptyMessage})`
        )
    )

export const generateColdDspFunctions = (
    { variableNamesIndex, precompilation }: Compilation
): AstSequence => {
    const {
        graph: { coldDspGroups },
    } = precompilation

    return Sequence(
        Object.entries(coldDspGroups).map(([groupId, dspGroup]) => {
            const funcName = variableNamesIndex.coldDspGroups[groupId]
            // prettier-ignore
            return Func(funcName, [Var('Message', 'm')], 'void')`
                ${dspGroup.traversal.map((nodeId) => 
                    precompilation.nodes[nodeId].loop
                )}
                ${dspGroup.sinkConnections
                    .filter(([_, sink]) => sink.portletId in precompilation.nodes[sink.nodeId].caching)
                    .map(([_, sink]) => 
                        precompilation.nodes[sink.nodeId].caching[sink.portletId]
                    )
                }
            `
        })
    )
}

export const generateImportsExports = (
    { precompilation }: Compilation,
    generateImport: (imprt: AstFunc) => AstSequence,
    generateExport: (xprt: GlobalCodeDefinitionExport) => AstSequence
): AstSequence =>
    Sequence([
        precompilation.dependencies.imports.map(generateImport),
        precompilation.dependencies.exports.map(generateExport),
    ])
