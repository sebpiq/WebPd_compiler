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
import { GlobalCodeDefinition, GlobalCodePrecompilationContext } from '../types'
import { AstElement, AstFunc, AstSequence, VariableName } from '../../ast/types'
import { traversers } from '../../dsp-graph'
import { commonsArrays, commonsWaitFrame, core, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'
import { Precompilation, PrecompiledCode } from './types'

export default (
    precompilation: Precompilation,
    minimalDependencies: Array<GlobalCodeDefinition>
) => {
    const { settings, variableNamesAssigner, precompiledCodeAssigner } =
        precompilation
    const dependencies = flattenDependencies([
        ...minimalDependencies,
        ..._collectDependenciesFromTraversal(precompilation),
    ])

    const context: GlobalCodePrecompilationContext = {
        globs: variableNamesAssigner.globs,
        globalCode: variableNamesAssigner.globalCode,
        settings,
    }

    // Flatten and de-duplicate all the module's dependencies
    precompiledCodeAssigner.dependencies.ast = instantiateAndDedupeDependencies(
        dependencies,
        context
    )

    // Collect and attach imports / exports info
    precompiledCodeAssigner.dependencies.exports = collectAndDedupeExports(
        dependencies,
        context
    )
    precompiledCodeAssigner.dependencies.imports = collectAndDedupeImports(
        dependencies,
        context
    )
}

export const instantiateAndDedupeDependencies = (
    dependencies: Array<GlobalCodeDefinition>,
    context: GlobalCodePrecompilationContext
): AstSequence => {
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
    commonsArrays,
    commonsWaitFrame,
    msg,
]

export const collectAndDedupeExports = (
    dependencies: Array<GlobalCodeDefinition>,
    context: GlobalCodePrecompilationContext
): PrecompiledCode['dependencies']['exports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .reduce<Array<VariableName>>(
            (exports, codeDefinition) =>
                codeDefinition.exports
                    ? [
                          ...exports,
                          ...codeDefinition
                              .exports(context)
                              .filter((xprt) =>
                                  exports.every(
                                      (otherExport) => xprt !== otherExport
                                  )
                              ),
                      ]
                    : exports,
            []
        )

export const collectAndDedupeImports = (
    dependencies: Array<GlobalCodeDefinition>,
    context: GlobalCodePrecompilationContext
): PrecompiledCode['dependencies']['imports'] =>
    dependencies
        .filter(isGlobalDefinitionWithSettings)
        .reduce<Array<AstFunc>>(
            (imports, codeDefinition) =>
                codeDefinition.imports
                    ? [
                          ...imports,
                          ...codeDefinition
                              .imports(context)
                              .filter((imprt) =>
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
