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
    getNodeImplementation,
    isGlobalDefinitionWithSettings,
} from '../compile-helpers'
import {
    Compilation,
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
    GlobalCodeGeneratorContext,
    NodeImplementations,
    Precompilation,
} from '../types'
import { AstElement, AstFunc } from '../../ast/types'
import deepEqual from 'deep-equal'
import { DspGraph, traversal } from '../../dsp-graph'
import { core, commonsCore, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'

export default (compilation: Compilation) => {
    const {
        graph,
        nodeImplementations,
        precompilation,
        target,
    } = compilation

    const dependencies = flattenDependencies([
        ...engineMinimalDependencies(),
        ..._collectDependenciesFromTraversal(
            nodeImplementations,
            graph,
            precompilation.traversals.all
        ),
    ])

    // Flatten and de-duplicate all the module's dependencies
    precompilation.dependencies.ast = instantiateAndDedupeDependencies(
        compilation,
        dependencies
    )

    // Collect and attach imports / exports info
    precompilation.dependencies.exports = collectAndDedupeExports(
        target,
        dependencies
    )
    precompilation.dependencies.imports = collectAndDedupeImports(dependencies)
}

export const instantiateAndDedupeDependencies = (
    compilation: Compilation,
    dependencies: Array<GlobalCodeDefinition>
): Precompilation['dependencies']['ast'] => {
    const context = _getGlobalCodeGeneratorContext(compilation)
    return Sequence(
        dependencies
            .map((codeDefinition) =>
                isGlobalDefinitionWithSettings(codeDefinition)
                    ? codeDefinition.codeGenerator(context)
                    : codeDefinition(context)
            )
            .reduce<Array<AstElement>>(
                (astElements, astElement) =>
                    astElements.every(
                        (otherElement) =>
                            !deepEqual(otherElement, astElement, {
                                strict: true,
                            })
                    )
                        ? [...astElements, astElement]
                        : astElements,
                []
            )
    )
}

export const engineMinimalDependencies = (): Array<GlobalCodeDefinition> => [
    core,
    commonsCore,
    msg,
]

export const collectAndDedupeExports = (
    target: CompilerTarget,
    dependencies: Array<GlobalCodeDefinition>
): Precompilation['dependencies']['exports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .filter((codeDefinition) => codeDefinition.exports)
        .reduce<Array<GlobalCodeDefinitionExport>>(
            (exports, codeDefinition) => [
                ...exports,
                ...codeDefinition.exports.filter(
                    (xprt) =>
                        (!xprt.targets || xprt.targets.includes(target)) &&
                        exports.every(
                            (otherExport) => xprt.name !== otherExport.name
                        )
                ),
            ],
            []
        )

export const collectAndDedupeImports = (
    dependencies: Array<GlobalCodeDefinition>
): Precompilation['dependencies']['imports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .filter((codeDefinition) => codeDefinition.imports)
        .reduce<Array<AstFunc>>(
            (imports, codeDefinition) => [
                ...imports,
                ...codeDefinition.imports.filter((imprt) =>
                    imports.every(
                        (otherImport) => imprt.name !== otherImport.name
                    )
                ),
            ],
            []
        )

export const flattenDependencies = (
    dependencies: Array<GlobalCodeDefinition>
): Array<GlobalCodeDefinition> =>
    dependencies.flatMap<GlobalCodeDefinition>((codeDefinition) => {
        if (
            isGlobalDefinitionWithSettings(codeDefinition) &&
            codeDefinition.dependencies
        ) {
            return [
                ...flattenDependencies(codeDefinition.dependencies),
                codeDefinition,
            ]
        } else {
            return [codeDefinition]
        }
    })

const _collectDependenciesFromTraversal = (
    nodeImplementations: NodeImplementations,
    graph: DspGraph.Graph,
    graphTraversalAll: DspGraph.GraphTraversal
): Array<GlobalCodeDefinition> => {
    return traversal
        .toNodes(graph, graphTraversalAll)
        .reduce<Array<GlobalCodeDefinition>>(
            (definitions, node) => [
                ...definitions,
                ...getNodeImplementation(nodeImplementations, node.type)
                    .dependencies,
            ],
            []
        )
}

const _getGlobalCodeGeneratorContext = (
    { settings, target, variableNamesIndex }: Compilation
): GlobalCodeGeneratorContext => ({
    target: target,
    audioSettings: settings.audio,
    globs: variableNamesIndex.globs,
})