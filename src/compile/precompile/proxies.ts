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
import {
    proxyAsProtectedIndex,
    proxyAsAssigner,
    AssignerSpec,
} from '../proxies'
import {
    PrecompilationInput,
    PrecompiledCode,
    VariableNamesIndex,
} from './types'
import { Sequence, ast } from '../../ast/declare'

// ---------------------------- VariableNamesIndex ---------------------------- //
const NS = {
    GLOBALS: 'G',
    NODES: 'N',
    NODE_TYPES: 'NT',
    IO: 'IO',
    COLD: 'COLD',
}

const _VARIABLE_NAMES_ASSIGNER_SPEC: AssignerSpec<
    VariableNamesIndex,
    PrecompilationInput
> = proxyAsAssigner.Interface({
    nodes: proxyAsAssigner.Index((nodeId: DspGraph.NodeId) =>
        proxyAsAssigner.Interface({
            signalOuts: proxyAsAssigner.Index((portletId: DspGraph.PortletId) =>
                proxyAsAssigner.Literal(() =>
                    _name(NS.NODES, nodeId, 'outs', portletId)
                )
            ),
            messageSenders: proxyAsAssigner.Index(
                (portletId: DspGraph.PortletId) =>
                    proxyAsAssigner.Literal(() =>
                        _name(NS.NODES, nodeId, 'snds', portletId)
                    )
            ),
            messageReceivers: proxyAsAssigner.Index(
                (portletId: DspGraph.PortletId) =>
                    proxyAsAssigner.Literal(() =>
                        _name(NS.NODES, nodeId, 'rcvs', portletId)
                    )
            ),
            state: proxyAsAssigner.LiteralDefaultNull(() =>
                _name(NS.NODES, nodeId, 'state')
            ),
        })
    ),

    nodeImplementations: proxyAsAssigner.Index(
        (nodeType, { nodeImplementations }) => {
            const nodeImplementation = getNodeImplementation(
                nodeImplementations,
                nodeType
            )
            const nodeTypePrefix =
                (nodeImplementation.flags
                    ? nodeImplementation.flags.alphaName
                    : null) || nodeType

            return proxyAsAssigner.Index((name) =>
                proxyAsAssigner.Literal(() =>
                    _name(NS.NODE_TYPES, nodeTypePrefix, name)
                )
            )
        }
    ),

    globals: proxyAsAssigner.Index((ns) =>
        proxyAsAssigner.Index((name) => {
            if (['fs'].includes(ns)) {
                return proxyAsAssigner.Literal(() =>
                    _name(NS.GLOBALS, ns, name)
                ) as any

                // We don't prefix stdlib core module, because these are super
                // basic functions that are always included in the global scope.
            } else if (ns === 'core') {
                return proxyAsAssigner.Literal(() => name)
            } else {
                return proxyAsAssigner.Literal(() =>
                    _name(NS.GLOBALS, ns, name)
                )
            }
        })
    ),

    io: proxyAsAssigner.Interface({
        messageReceivers: proxyAsAssigner.Index((nodeId: DspGraph.NodeId) =>
            proxyAsAssigner.Index((inletId: DspGraph.PortletId) =>
                proxyAsAssigner.Literal(() =>
                    _name(NS.IO, 'rcv', nodeId, inletId)
                )
            )
        ),
        messageSenders: proxyAsAssigner.Index((nodeId: DspGraph.NodeId) =>
            proxyAsAssigner.Index((outletId: DspGraph.PortletId) =>
                proxyAsAssigner.Literal(() =>
                    _name(NS.IO, 'snd', nodeId, outletId)
                )
            )
        ),
    }),

    coldDspGroups: proxyAsAssigner.Index((groupId: string) =>
        proxyAsAssigner.Literal(() => _name(NS.COLD, groupId))
    ),
})

/**
 * Creates a proxy to a VariableNamesIndex object that makes sure that
 * all valid entries are provided with a default value on the fly
 * when they are first accessed.
 */
export const proxyAsVariableNamesAssigner = ({
    input: context,
    variableNamesIndex,
}: {
    input: PrecompilationInput
    variableNamesIndex: Partial<VariableNamesIndex>
}) =>
    proxyAsAssigner(_VARIABLE_NAMES_ASSIGNER_SPEC, variableNamesIndex, context)

export const createVariableNamesIndex = (
    precompilationInput: PrecompilationInput
) =>
    proxyAsAssigner.ensureValue(
        {},
        _VARIABLE_NAMES_ASSIGNER_SPEC,
        precompilationInput
    )

// ---------------------------- PrecompiledCode ---------------------------- //
const _PRECOMPILED_CODE_ASSIGNER_SPEC: AssignerSpec<
    PrecompiledCode,
    PrecompilationInput
> = proxyAsAssigner.Interface({
    graph: proxyAsAssigner.Literal(
        (_, path) =>
            ({
                fullTraversal: [],
                hotDspGroup: {
                    traversal: [],
                    outNodesIds: [],
                },
                coldDspGroups: proxyAsProtectedIndex({}, path),
            } as PrecompiledCode['graph'])
    ),

    nodeImplementations: proxyAsAssigner.Index(
        (nodeType, { nodeImplementations }) =>
            proxyAsAssigner.Literal(() => ({
                nodeImplementation: getNodeImplementation(
                    nodeImplementations,
                    nodeType
                ),
                stateClass: null,
                core: null,
            })),
        (_, path) => proxyAsProtectedIndex({}, path)
    ),

    nodes: proxyAsAssigner.Index(
        (nodeId, { graph }) =>
            proxyAsAssigner.Literal(() => ({
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
        (_, path) => proxyAsProtectedIndex({}, path)
    ),

    dependencies: proxyAsAssigner.Literal(
        () =>
            ({
                imports: [],
                exports: [],
                ast: Sequence([]),
            } as PrecompiledCode['dependencies'])
    ),

    io: proxyAsAssigner.Interface({
        messageReceivers: proxyAsAssigner.Index(
            (_: DspGraph.NodeId) =>
                proxyAsAssigner.Literal((_, path) =>
                    proxyAsProtectedIndex({}, path)
                ),
            (_, path) => proxyAsProtectedIndex({}, path)
        ),
        messageSenders: proxyAsAssigner.Index(
            (_: DspGraph.NodeId) =>
                proxyAsAssigner.Literal((_, path) =>
                    proxyAsProtectedIndex({}, path)
                ),
            (_, path) => proxyAsProtectedIndex({}, path)
        ),
    }),
})

/**
 * Creates a proxy to a PrecompiledCode object that makes sure that
 * all valid entries are provided with a default value on the fly
 * when they are first accessed.
 */
export const proxyAsPrecompiledCodeAssigner = ({
    input: context,
    precompiledCode,
}: {
    input: PrecompilationInput
    precompiledCode: Partial<PrecompiledCode>
}) => proxyAsAssigner(_PRECOMPILED_CODE_ASSIGNER_SPEC, precompiledCode, context)

export const createPrecompiledCode = (
    precompilationInput: PrecompilationInput
) =>
    proxyAsAssigner.ensureValue(
        {},
        _PRECOMPILED_CODE_ASSIGNER_SPEC,
        precompilationInput
    )

// ---------------------------- MISC ---------------------------- //
const _name = (...parts: Array<string>) =>
    parts.map(assertValidNamePart).join('_')

export const assertValidNamePart = (namePart: string) => {
    const isInvalid = !VALID_NAME_PART_REGEXP.exec(namePart)
    if (isInvalid) {
        throw new Error(
            `Invalid variable name for code generation "${namePart}"`
        )
    }
    return namePart
}
const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/
