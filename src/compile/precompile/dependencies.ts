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
import { isGlobalDefinitionWithSettings } from '../compile-helpers'
import {
    Compilation,
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
    GlobalCodeGeneratorContext,
    Precompilation,
} from '../types'
import { AstElement, AstFunc, AstSequence } from '../../ast/types'
import { traversers } from '../../dsp-graph'
import { core, commonsCore, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'

export default (compilation: Compilation) => {
    const { precompilation, target } = compilation

    const dependencies = flattenDependencies([
        ...engineMinimalDependencies(),
        ..._collectDependenciesFromTraversal(compilation),
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
): AstSequence => {
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
                        (otherElement) => !_deepEqual(otherElement, astElement)
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

const _collectDependenciesFromTraversal = ({
    precompilation,
    graph,
}: Compilation): Array<GlobalCodeDefinition> => {
    return traversers
        .toNodes(graph, precompilation.graph.fullTraversal)
        .reduce<Array<GlobalCodeDefinition>>(
            (definitions, node) => [
                ...definitions,
                ...precompilation.nodes[node.id].nodeImplementation
                    .dependencies,
            ],
            []
        )
}

const _getGlobalCodeGeneratorContext = ({
    settings,
    target,
    variableNamesIndex,
}: Compilation): GlobalCodeGeneratorContext => ({
    target: target,
    audioSettings: settings.audio,
    globs: variableNamesIndex.globs,
})

const _deepEqual = (ast1: AstElement, ast2: AstElement) =>
    // This works but this flawed cause {a: 1, b: 2} and {b: 2, a: 1}
    // would compare to false.
    JSON.stringify(ast1) === JSON.stringify(ast2)
