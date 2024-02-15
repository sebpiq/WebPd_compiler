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

export const precompileStateClass = (
    {
        input: { graph, settings },
        output,
        proxies: { variableNamesAssigner },
    }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const precompiledImplementation = output.nodeImplementations[nodeType]!

    if (precompiledImplementation.nodeImplementation.state) {
        const sampleNode = Object.values(graph).find(
            (node) => node.type === nodeType
        )
        if (!sampleNode) {
            throw new Error(
                `No node of type "${nodeType}" exists in the graph.`
            )
        }

        const stateClassName =
            variableNamesAssigner.nodeImplementations[nodeType]!.stateClass!

        const astClass = precompiledImplementation.nodeImplementation.state({
            globs: variableNamesAssigner.globs,
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
    {
        input: { settings },
        output,
        proxies: { variableNamesAssigner },
    }: Precompilation,
    nodeType: DspGraph.NodeType
) => {
    const precompiledImplementation = output.nodeImplementations[nodeType]!
    const nodeImplementation = precompiledImplementation.nodeImplementation
    const stateClassName =
        variableNamesAssigner.nodeImplementations[nodeType]!.stateClass ||
        undefined
    if (nodeImplementation.core) {
        precompiledImplementation.core = nodeImplementation.core({
            settings,
            globs: variableNamesAssigner.globs,
            stateClassName,
        })
    }
}
