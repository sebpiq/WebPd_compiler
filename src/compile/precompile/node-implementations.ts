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
import { Precompilation } from './types'
import { attachNodeImplementationVariable } from './variable-names-index'

export const precompileStateClass = (
    { input: { graph, settings }, output }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const precompiledImplementation = output.nodeImplementations[nodeType]!

    if (precompiledImplementation.nodeImplementation.state) {
        if (!variableNamesIndex.nodeImplementations[nodeType]!.stateClass) {
            attachNodeImplementationVariable(
                variableNamesIndex,
                'stateClass',
                nodeType,
                precompiledImplementation.nodeImplementation
            )
        }
        const sampleNode = Object.values(graph).find(
            (node) => node.type === nodeType
        )
        if (!sampleNode) {
            throw new Error(
                `No node of type "${nodeType}" exists in the graph.`
            )
        }
        const stateClassName =
            variableNamesIndex.nodeImplementations[nodeType]!.stateClass
        if (!stateClassName) {
            throw new Error(
                `No state class name defined for node type "${nodeType}".`
            )
        }
        const astClass = precompiledImplementation.nodeImplementation.state({
            globs,
            node: sampleNode,
            settings,
            stateClassName,
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
    { input: { settings }, output }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const precompiledImplementation = output.nodeImplementations[nodeType]!
    const nodeImplementation = precompiledImplementation.nodeImplementation
    const stateClassName =
        variableNamesIndex.nodeImplementations[nodeType]!.stateClass ||
        undefined
    if (nodeImplementation.core) {
        precompiledImplementation.core = nodeImplementation.core({
            settings,
            globs,
            stateClassName,
        })
    }
}
