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
import {
    PrecompilationInput,
    PrecompiledCode,
    VariableNamesIndex,
} from './types'
import { Sequence, ast } from '../../ast/declare'

const NS = {
    GLOBS: 'G',
    NODES: 'N',
    NODE_TYPES: 'NT',
    GLOBAL_CODE: 'C',
    IO: 'IO',
    COLD: 'COLD',
    // Reserved namespace for variables exported by the engine.
    // For convenience (for typing and bindings) the names of these
    // are hardcoded rather than assigned dynamically.
    EXPORTED: 'x',
}

// ---------------------------- VariableNamesIndex ---------------------------- //
export const VariableNamesAssigner = ({
    input: context,
    variableNamesIndex,
}: {
    input: PrecompilationInput
    variableNamesIndex: Partial<VariableNamesIndex>
}) => Assigner(_VariableNamesAssignerSpec, variableNamesIndex, context)

export const createVariableNamesIndex = (
    precompilationInput: PrecompilationInput
) => Assigner.ensureValue({}, _VariableNamesAssignerSpec, precompilationInput)

const _VariableNamesAssignerSpec: AssignerSpec<
    VariableNamesIndex,
    PrecompilationInput
> = Assigner.Interface({
    nodes: Assigner.Index((nodeId: DspGraph.NodeId) =>
        Assigner.Interface({
            signalOuts: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() =>
                    _name(NS.NODES, nodeId, 'outs', portletId)
                )
            ),
            messageSenders: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() =>
                    _name(NS.NODES, nodeId, 'snds', portletId)
                )
            ),
            messageReceivers: Assigner.Index((portletId: DspGraph.PortletId) =>
                Assigner.Literal(() =>
                    _name(NS.NODES, nodeId, 'rcvs', portletId)
                )
            ),
            state: Assigner.LiteralDefaultNull(() =>
                _name(NS.NODES, nodeId, 'state')
            ),
        })
    ),

    nodeImplementations: Assigner.Index((nodeType, { nodeImplementations }) => {
        const nodeImplementation = getNodeImplementation(
            nodeImplementations,
            nodeType
        )
        const nodeTypePrefix =
            (nodeImplementation.flags
                ? nodeImplementation.flags.alphaName
                : null) || nodeType

        return Assigner.Index((name) =>
            Assigner.Literal(() => _name(NS.NODE_TYPES, nodeTypePrefix, name))
        )
    }),

    globals: Assigner.Index((ns) =>
        Assigner.Index((name) =>
            ns === 'core'
            // We don't prefix stdlib core module, because these are super 
            // basic functions that are always included in the global scope.
                ? Assigner.Literal(() => name)
                : Assigner.Literal(() => _name(NS.GLOBAL_CODE, ns, name))
        )
    ),

    io: Assigner.Interface({
        messageReceivers: Assigner.Index((nodeId: DspGraph.NodeId) =>
            Assigner.Index((inletId: DspGraph.PortletId) =>
                Assigner.Literal(() => _name(NS.IO, 'rcv', nodeId, inletId))
            )
        ),
        messageSenders: Assigner.Index((nodeId: DspGraph.NodeId) =>
            Assigner.Index((outletId: DspGraph.PortletId) =>
                Assigner.Literal(() => _name(NS.IO, 'snd', nodeId, outletId))
            )
        ),
    }),

    coldDspGroups: Assigner.Index((groupId: string) =>
        Assigner.Literal(() => _name(NS.COLD, groupId))
    ),
})

// ---------------------------- PrecompiledCode ---------------------------- //
export const PrecompiledCodeAssigner = ({
    input: context,
    precompiledCode,
}: {
    input: PrecompilationInput
    precompiledCode: Partial<PrecompiledCode>
}) => Assigner(_PrecompiledCodeAssignerSpec, precompiledCode, context)

export const createPrecompiledCode = (
    precompilationInput: PrecompilationInput
) => Assigner.ensureValue({}, _PrecompiledCodeAssignerSpec, precompilationInput)

const _PrecompiledCodeAssignerSpec: AssignerSpec<
    PrecompiledCode,
    PrecompilationInput
> = Assigner.Interface({
    graph: Assigner.Literal(
        (_, path) =>
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
        (_, path) => ProtectedIndex({}, path)
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
        (_, path) => ProtectedIndex({}, path)
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
            (_: DspGraph.NodeId) =>
                Assigner.Literal((_, path) => ProtectedIndex({}, path)),
            (_, path) => ProtectedIndex({}, path)
        ),
        messageSenders: Assigner.Index(
            (_: DspGraph.NodeId) =>
                Assigner.Literal((_, path) => ProtectedIndex({}, path)),
            (_, path) => ProtectedIndex({}, path)
        ),
    }),
})

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
