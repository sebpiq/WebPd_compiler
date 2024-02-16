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

import { DspGraph, getters } from '../../dsp-graph'
import { getNodeImplementation } from '../compile-helpers'
import { ProtectedIndex, Assigner, AssignerSpec } from '../proxies'
import { Precompilation, PrecompiledCode, VariableNamesIndex } from './types'
import { Sequence, ast } from '../../ast/declare'
import { NodeImplementations } from '../types'

export const VariableNamesAssigner = ({
    input,
    variableNamesIndex,
}: {
    input: Precompilation['input']
    variableNamesIndex: Partial<VariableNamesIndex>
}) => Assigner(_VariableNamesAssignerSpec, input, variableNamesIndex)

export const createVariableNamesIndex = () =>
    Assigner.ensureValue({}, _VariableNamesAssignerSpec)

const _VariableNamesAssignerSpec: AssignerSpec<
    VariableNamesIndex,
    Precompilation['input']
> = Assigner.Interface({
    nodes: Assigner.Index((nodeId: DspGraph.NodeId) =>
        Assigner.Interface({
            signalOuts: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() => `${_v(nodeId)}_OUTS_${_v(portletId)}`)
            ),
            messageSenders: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() => `${_v(nodeId)}_SNDS_${_v(portletId)}`)
            ),
            messageReceivers: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() => `${_v(nodeId)}_RCVS_${_v(portletId)}`)
            ),
            state: Assigner.LiteralDefaultNull(() => `${_v(nodeId)}_STATE`),
        })
    ),

    nodeImplementations: Assigner.Index(
        (nodeType: DspGraph.NodeType, { nodeImplementations }) => {
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                nodeType
            )
            return Assigner.Interface({
                stateClass: Assigner.LiteralDefaultNull(
                    () =>
                        `State_${_v(
                            (nodeImplementation.flags
                                ? nodeImplementation.flags.alphaName
                                : null) || nodeType
                        )}`
                ),
            })
        }
    ),

    /** Namespace for global variables */
    globs: Assigner.Literal(() => ({
        iterFrame: 'F',
        frame: 'FRAME',
        blockSize: 'BLOCK_SIZE',
        sampleRate: 'SAMPLE_RATE',
        output: 'OUTPUT',
        input: 'INPUT',
        nullMessageReceiver: 'SND_TO_NULL',
        nullSignal: 'NULL_SIGNAL',
        emptyMessage: 'EMPTY_MESSAGE',
    })),

    io: Assigner.Interface({
        messageReceivers: Assigner.Index((nodeId: DspGraph.NodeId) =>
            Assigner.Index((inletId: DspGraph.PortletId) =>
                Assigner.Literal(() => `ioRcv_${nodeId}_${inletId}`)
            )
        ),
        messageSenders: Assigner.Index((nodeId: DspGraph.NodeId) =>
            Assigner.Index((outletId: DspGraph.PortletId) =>
                Assigner.Literal(() => `ioSnd_${nodeId}_${outletId}`)
            )
        ),
    }),

    coldDspGroups: Assigner.Index((groupId: string) =>
        Assigner.Literal(() => `coldDsp_${groupId}`)
    ),
})

export const PrecompiledCodeAssigner = ({
    input,
    precompiledCode,
}: {
    input: { graph: DspGraph.Graph; nodeImplementations: NodeImplementations }
    precompiledCode: Partial<PrecompiledCode>
}) => Assigner(_PrecompiledCodeAssignerSpec, input, precompiledCode)

export const createPrecompiledCode = () =>
    Assigner.ensureValue({}, _PrecompiledCodeAssignerSpec)

const _PrecompiledCodeAssignerSpec: AssignerSpec<
    PrecompiledCode,
    { graph: DspGraph.Graph; nodeImplementations: NodeImplementations }
> = Assigner.Interface({
    graph: Assigner.Literal(
        (path) =>
            ({
                fullTraversal: [],
                hotDspGroup: {
                    traversal: [],
                    outNodesIds: [],
                },
                coldDspGroups: ProtectedIndex({}, path),
            } as PrecompiledCode['graph'])
    ),

    nodeImplementations: Assigner.Index(
        (nodeType, { nodeImplementations }) =>
            Assigner.Literal(() => ({
                nodeImplementation: getNodeImplementation(
                    nodeImplementations,
                    nodeType
                ),
                stateClass: null,
                core: null,
            })),
        (path) => ProtectedIndex({}, path)
    ),

    nodes: Assigner.Index(
        (nodeId, { graph }) =>
            Assigner.Literal(() => ({
                nodeType: getters.getNode(graph, nodeId).type,
                messageReceivers: {},
                messageSenders: {},
                signalOuts: {},
                signalIns: {},
                initialization: ast``,
                dsp: {
                    loop: ast``,
                    inlets: {},
                },
                state: null,
            })),
        (path) => ProtectedIndex({}, path)
    ),

    dependencies: Assigner.Literal(
        () =>
            ({
                imports: [],
                exports: [],
                ast: Sequence([]),
            } as PrecompiledCode['dependencies'])
    ),

    io: Assigner.Interface({
        messageReceivers: Assigner.Index(
            (_: DspGraph.NodeId) => Assigner.Literal(() => ({})),
            (path) => ProtectedIndex({}, path)
        ),
        messageSenders: Assigner.Index(
            (_: DspGraph.NodeId) => Assigner.Literal(() => ({})),
            (path) => ProtectedIndex({}, path)
        ),
    }),
})

export const assertValidNamePart = (namePart: string) => {
    const isInvalid = !VALID_NAME_PART_REGEXP.exec(namePart)
    if (isInvalid) {
        throw new Error(
            `Invalid variable name for code generation "${namePart}"`
        )
    }
    return namePart
}
const _v = assertValidNamePart
const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/
