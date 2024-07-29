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
import { GlobalsDefinitions, GlobalCodePrecompilationContext } from '../types'
import { AstElement, AstFunc, AstSequence, VariableName } from '../../ast/types'
import { traversers } from '../../dsp-graph'
import { commonsArrays, commonsWaitFrame, core, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'
import { Precompilation, PrecompiledCode, VariableNamesIndex } from './types'
import { ReadOnlyIndex } from '../proxies'

export default (
    precompilation: Precompilation,
    minimalDependencies: Array<GlobalsDefinitions>
) => {
    const { settings, variableNamesAssigner, precompiledCodeAssigner } =
        precompilation
    const dependencies = flattenDependencies([
        ...minimalDependencies,
        ..._collectDependenciesFromTraversal(precompilation),
    ])

    const context: GlobalCodePrecompilationContext = {
        globalCode: ReadOnlyIndex(precompilation.variableNamesIndex.globalCode),
        settings,
    }

    // Flatten and de-duplicate all the module's dependencies
    precompiledCodeAssigner.dependencies.ast = instantiateAndDedupeDependencies(
        dependencies,
        variableNamesAssigner,
        context
    )

    // Collect and attach imports / exports info
    precompiledCodeAssigner.dependencies.exports = collectAndDedupeExports(
        dependencies,
        variableNamesAssigner,
        context
    )
    precompiledCodeAssigner.dependencies.imports = collectAndDedupeImports(
        dependencies,
        variableNamesAssigner,
        context
    )
}

export const instantiateAndDedupeDependencies = (
    dependencies: Array<GlobalsDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    context: GlobalCodePrecompilationContext
): AstSequence => {
    return Sequence(
        dependencies
            .map((globalsDefinitions) =>
                globalsDefinitions.code(
                    _getAssignerNamespace(
                        variableNamesAssigner,
                        globalsDefinitions
                    ),
                    context
                )
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

export const engineMinimalDependencies = (): Array<GlobalsDefinitions> => [
    core,
    commonsArrays,
    commonsWaitFrame,
    msg,
]

export const collectAndDedupeExports = (
    dependencies: Array<GlobalsDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    context: GlobalCodePrecompilationContext
): PrecompiledCode['dependencies']['exports'] =>
    dependencies.reduce<Array<VariableName>>(
        (exports, globalsDefinitions) =>
            globalsDefinitions.exports
                ? [
                      ...exports,
                      ...globalsDefinitions
                          .exports(
                              _getAssignerNamespace(
                                  variableNamesAssigner,
                                  globalsDefinitions
                              ),
                              context
                          )
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
    dependencies: Array<GlobalsDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    context: GlobalCodePrecompilationContext
): PrecompiledCode['dependencies']['imports'] =>
    dependencies.reduce<Array<AstFunc>>(
        (imports, globalsDefinitions) =>
            globalsDefinitions.imports
                ? [
                      ...imports,
                      ...globalsDefinitions
                          .imports(
                              _getAssignerNamespace(
                                  variableNamesAssigner,
                                  globalsDefinitions
                              ),
                              context
                          )
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
    dependencies: Array<GlobalsDefinitions>
): Array<GlobalsDefinitions> =>
    dependencies.flatMap<GlobalsDefinitions>((globalsDefinitions) => {
        if (globalsDefinitions.dependencies) {
            return [
                ...flattenDependencies(globalsDefinitions.dependencies),
                globalsDefinitions,
            ]
        } else {
            return [globalsDefinitions]
        }
    })

const _collectDependenciesFromTraversal = ({
    graph,
    precompiledCodeAssigner,
}: Precompilation): Array<GlobalsDefinitions> => {
    return traversers
        .toNodes(graph, precompiledCodeAssigner.graph.fullTraversal)
        .reduce<Array<GlobalsDefinitions>>((definitions, node) => {
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

const _getAssignerNamespace = (
    variableNamesAssigner: VariableNamesIndex,
    globalsDefinitions: GlobalsDefinitions
) => variableNamesAssigner.globalCode[globalsDefinitions.namespace]!
