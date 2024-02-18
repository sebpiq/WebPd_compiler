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
    CompilationSettings,
    CompilerTarget,
    GlobalCodeDefinition,
    GlobalCodeDefinitionExport,
} from '../types'
import { AstElement, AstFunc, AstSequence } from '../../ast/types'
import { traversers } from '../../dsp-graph'
import { commonsWaitFrame, core, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'
import { Precompilation, PrecompiledCode, VariableNamesIndex } from './types'

export default (precompilation: Precompilation) => {
    const {
        settings,
        variableNamesAssigner,
        precompiledCodeAssigner,
    } = precompilation
    const dependencies = flattenDependencies([
        ...engineMinimalDependencies(),
        ..._collectDependenciesFromTraversal(precompilation),
    ])

    // Flatten and de-duplicate all the module's dependencies
    precompiledCodeAssigner.dependencies.ast = instantiateAndDedupeDependencies(
        settings,
        dependencies,
        variableNamesAssigner.globs
    )

    // Collect and attach imports / exports info
    precompiledCodeAssigner.dependencies.exports = collectAndDedupeExports(
        settings.target,
        dependencies
    )
    precompiledCodeAssigner.dependencies.imports =
        collectAndDedupeImports(dependencies)
}

export const instantiateAndDedupeDependencies = (
    settings: CompilationSettings,
    dependencies: Array<GlobalCodeDefinition>,
    globs: VariableNamesIndex['globs']
): AstSequence => {
    const context = {
        settings,
        globs,
    }
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
    commonsWaitFrame,
    msg,
]

export const collectAndDedupeExports = (
    target: CompilerTarget,
    dependencies: Array<GlobalCodeDefinition>
): PrecompiledCode['dependencies']['exports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .reduce<Array<GlobalCodeDefinitionExport>>(
            (exports, codeDefinition) =>
                codeDefinition.exports
                    ? [
                          ...exports,
                          ...codeDefinition.exports.filter(
                              (xprt) =>
                                  (!xprt.targets ||
                                      xprt.targets.includes(target)) &&
                                  exports.every(
                                      (otherExport) =>
                                          xprt.name !== otherExport.name
                                  )
                          ),
                      ]
                    : exports,
            []
        )

export const collectAndDedupeImports = (
    dependencies: Array<GlobalCodeDefinition>
): PrecompiledCode['dependencies']['imports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .reduce<Array<AstFunc>>(
            (imports, codeDefinition) =>
                codeDefinition.imports
                    ? [
                          ...imports,
                          ...codeDefinition.imports.filter((imprt) =>
                              imports.every(
                                  (otherImport) =>
                                      imprt.name !== otherImport.name
                              )
                          ),
                      ]
                    : imports,
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
    graph,
    precompiledCodeAssigner,
}: Precompilation): Array<GlobalCodeDefinition> => {
    return traversers
        .toNodes(graph, precompiledCodeAssigner.graph.fullTraversal)
        .reduce<Array<GlobalCodeDefinition>>((definitions, node) => {
            const precompiledNode = precompiledCodeAssigner.nodes[node.id]!
            const precompiledNodeImplementation =
                precompiledCodeAssigner.nodeImplementations[
                    precompiledNode.nodeType
                ]!
            return [
                ...definitions,
                ...(precompiledNodeImplementation.nodeImplementation
                    .dependencies || []),
            ]
        }, [])
}

const _deepEqual = (ast1: AstElement, ast2: AstElement) =>
    // This works but this flawed cause {a: 1, b: 2} and {b: 2, a: 1}
    // would compare to false.
    JSON.stringify(ast1) === JSON.stringify(ast2)
