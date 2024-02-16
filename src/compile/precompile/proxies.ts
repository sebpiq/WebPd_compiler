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

import { createNamespace } from '../compile-helpers'
import { DspGraph, getters } from '../../dsp-graph'
import { getNodeImplementation } from '../compile-helpers'
import {
    Assigner,
    assignerInitializeDefaults,
    AssignerSpec,
    Interface,
    Index,
    Literal,
    LiteralDefaultNull,
} from '../proxies'
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
    assignerInitializeDefaults({}, _VariableNamesAssignerSpec)

const _VariableNamesAssignerSpec: AssignerSpec<
    VariableNamesIndex,
    Precompilation['input']
> = Interface({
    nodes: Index((nodeId: DspGraph.NodeId) =>
        Interface({
            signalOuts: Index((portletId: DspGraph.PortletId) =>
                Literal(() => `${_v(nodeId)}_OUTS_${_v(portletId)}`)
            ),
            messageSenders: Index((portletId: DspGraph.PortletId) =>
                Literal(() => `${_v(nodeId)}_SNDS_${_v(portletId)}`)
            ),
            messageReceivers: Index((portletId: DspGraph.PortletId) =>
                Literal(() => `${_v(nodeId)}_RCVS_${_v(portletId)}`)
            ),
            state: LiteralDefaultNull(() => `${_v(nodeId)}_STATE`),
        })
    ),

    nodeImplementations: Index(
        (nodeType: DspGraph.NodeType, { nodeImplementations }) => {
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                nodeType
            )
            return Interface({
                stateClass: LiteralDefaultNull(
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
    globs: Literal(() => ({
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

    io: Interface({
        messageReceivers: Index((nodeId: DspGraph.NodeId) =>
            Index((inletId: DspGraph.PortletId) =>
                Literal(() => `ioRcv_${nodeId}_${inletId}`)
            )
        ),
        messageSenders: Index((nodeId: DspGraph.NodeId) =>
            Index((outletId: DspGraph.PortletId) =>
                Literal(() => `ioSnd_${nodeId}_${outletId}`)
            )
        ),
    }),

    coldDspGroups: Index((groupId: string) =>
        Literal(() => `coldDsp_${groupId}`)
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
    assignerInitializeDefaults({}, _PrecompiledCodeAssignerSpec)

const _PrecompiledCodeAssignerSpec: AssignerSpec<
    PrecompiledCode,
    { graph: DspGraph.Graph; nodeImplementations: NodeImplementations }
> = Interface({
    graph: Literal(
        () =>
            ({
                fullTraversal: [],
                hotDspGroup: {
                    traversal: [],
                    outNodesIds: [],
                },
                coldDspGroups: createNamespace('coldDspGroups', {}),
            } as PrecompiledCode['graph'])
    ),

    nodeImplementations: Index((nodeType, { nodeImplementations }) =>
        Literal(() => ({
            nodeImplementation: getNodeImplementation(
                nodeImplementations,
                nodeType
            ),
            stateClass: null,
            core: null,
        }))
    ),

    nodes: Index((nodeId, { graph }) =>
        Literal(() => ({
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
        }))
    ),

    dependencies: Literal(
        () =>
            ({
                imports: [],
                exports: [],
                ast: Sequence([]),
            } as PrecompiledCode['dependencies'])
    ),

    io: Interface({
        messageReceivers: Index((_: DspGraph.NodeId) => Literal(() => ({}))),
        messageSenders: Index((_: DspGraph.NodeId) => Literal(() => ({}))),
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
