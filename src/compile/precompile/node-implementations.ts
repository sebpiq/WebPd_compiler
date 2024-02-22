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
import { DspGraph } from '../../dsp-graph'
import { getNodeImplementation } from '../compile-helpers'
import { Assigner, AssignerSpec } from '../proxies'
import { NodeImplementations } from '../types'
import { assertValidNamePart } from './proxies'
import { Precompilation, VariableNamesIndex } from './types'

export const STATE_CLASS_NAME = 'State'

export const precompileStateClass = (
    {
        graph,
        settings,
        nodeImplementations,
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const precompiledImplementation =
        precompiledCodeAssigner.nodeImplementations[nodeType]!

    if (precompiledImplementation.nodeImplementation.state) {
        const sampleNode = Object.values(graph).find(
            (node) => node.type === nodeType
        )
        if (!sampleNode) {
            throw new Error(
                `No node of type "${nodeType}" exists in the graph.`
            )
        }
        const namespaceAssigner = NamespaceAssigner({
            nodeType,
            nodeImplementations,
            variableNamesAssigner,
        })

        const astClass = precompiledImplementation.nodeImplementation.state({
            globs: variableNamesAssigner.globs,
            node: sampleNode,
            settings,
            ns: namespaceAssigner,
        })
        precompiledImplementation.stateClass = {
            ...astClass,
            // Reset member values which are irrelevant in the state class.
            members: astClass.members.map((member) => ({
                ...member,
                value: undefined,
            })),
        }
    }
}

export const precompileCore = (
    {
        settings,
        nodeImplementations,
        variableNamesAssigner,
        precompiledCodeAssigner,
    }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const precompiledImplementation =
        precompiledCodeAssigner.nodeImplementations[nodeType]!
    const nodeImplementation = precompiledImplementation.nodeImplementation
    if (nodeImplementation.core) {
        const namespaceAssigner = NamespaceAssigner({
            nodeType,
            nodeImplementations,
            variableNamesAssigner,
        })
        precompiledImplementation.core = nodeImplementation.core({
            settings,
            globs: variableNamesAssigner.globs,
            ns: namespaceAssigner,
        })
    }
}

export const NamespaceAssigner = ({
    variableNamesAssigner,
    nodeType,
    nodeImplementations,
}: {
    variableNamesAssigner: VariableNamesIndex
    nodeType: DspGraph.NodeType
    nodeImplementations: NodeImplementations
}) => {
    const namespace = variableNamesAssigner.nodeImplementations[nodeType]!
    const prefix = _namespacePrefix(nodeImplementations, nodeType)
    return Assigner(
        _VariableNamesNodeImplementationAssignerSpec,
        namespace,
        prefix
    )
}

const _VariableNamesNodeImplementationAssignerSpec: AssignerSpec<
    VariableNamesIndex['nodeImplementations'][keyof VariableNamesIndex['nodeImplementations']],
    string
> = Assigner.Index((name, prefix) =>
    Assigner.Literal(() => _variableName(prefix, name))
)

const _namespacePrefix = (
    nodeImplementations: NodeImplementations,
    nodeType: DspGraph.NodeType
) => {
    const nodeImplementation = getNodeImplementation(
        nodeImplementations,
        nodeType
    )
    return assertValidNamePart(
        (nodeImplementation.flags
            ? nodeImplementation.flags.alphaName
            : null) || nodeType
    )
}

const _variableName = (prefix: string, name: string) =>
    `${prefix}_${assertValidNamePart(name)}`
