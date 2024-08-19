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
import { GlobalDefinitions, GlobalPrecompilationContext } from '../types'
import { AstElement, AstFunc, AstSequence, VariableName } from '../../ast/types'
import { traversers } from '../../dsp-graph'
import { commonsArrays, commonsWaitFrame, core, msg } from '../../stdlib'
import { Sequence } from '../../ast/declare'
import { Precompilation, PrecompiledCode, VariableNamesIndex } from './types'
import { proxyAsReadOnlyIndex } from '../proxies'

export default (
    precompilation: Precompilation,
    minimalDependencies: Array<GlobalDefinitions>
) => {
    const { settings, variableNamesAssigner, precompiledCodeAssigner } =
        precompilation
    const dependencies = flattenDependencies([
        ...minimalDependencies,
        ..._collectDependenciesFromGraph(precompilation),
    ])

    const globalContext: GlobalPrecompilationContext = {
        globals: proxyAsReadOnlyIndex(
            precompilation.variableNamesIndex.globals
        ),
        settings,
    }

    // Flatten and de-duplicate all the module's dependencies
    precompiledCodeAssigner.dependencies.ast = instantiateAndDedupeDependencies(
        dependencies,
        variableNamesAssigner,
        globalContext
    )

    // Collect and attach imports / exports info
    precompiledCodeAssigner.dependencies.exports = collectAndDedupeExports(
        dependencies,
        variableNamesAssigner,
        globalContext
    )
    precompiledCodeAssigner.dependencies.imports = collectAndDedupeImports(
        dependencies,
        variableNamesAssigner,
        globalContext
    )
}

export const instantiateAndDedupeDependencies = (
    dependencies: Array<GlobalDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    globalContext: GlobalPrecompilationContext
): AstSequence => {
    return Sequence(
        dependencies
            .map((globalDefinitions) =>
                globalDefinitions.code(
                    _getLocalContext(variableNamesAssigner, globalDefinitions),
                    globalContext
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

export const engineMinimalDependencies = (): Array<GlobalDefinitions> => [
    core,
    commonsArrays,
    commonsWaitFrame,
    msg,
]

export const collectAndDedupeExports = (
    dependencies: Array<GlobalDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    globalContext: GlobalPrecompilationContext
): PrecompiledCode['dependencies']['exports'] =>
    dependencies.reduce<Array<VariableName>>(
        (exports, globalDefinitions) =>
            globalDefinitions.exports
                ? [
                      ...exports,
                      ...globalDefinitions
                          .exports(
                              _getLocalContext(
                                  variableNamesAssigner,
                                  globalDefinitions
                              ),
                              globalContext
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
    dependencies: Array<GlobalDefinitions>,
    variableNamesAssigner: VariableNamesIndex,
    globalContext: GlobalPrecompilationContext
): PrecompiledCode['dependencies']['imports'] =>
    dependencies.reduce<Array<AstFunc>>(
        (imports, globalDefinitions) =>
            globalDefinitions.imports
                ? [
                      ...imports,
                      ...globalDefinitions
                          .imports(
                              _getLocalContext(
                                  variableNamesAssigner,
                                  globalDefinitions
                              ),
                              globalContext
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
    dependencies: Array<GlobalDefinitions>
): Array<GlobalDefinitions> =>
    dependencies.flatMap<GlobalDefinitions>((globalDefinitions) => {
        if (globalDefinitions.dependencies) {
            return [
                ...flattenDependencies(globalDefinitions.dependencies),
                globalDefinitions,
            ]
        } else {
            return [globalDefinitions]
        }
    })

const _collectDependenciesFromGraph = ({
    graph,
    precompiledCodeAssigner,
}: Precompilation): Array<GlobalDefinitions> => {
    return traversers
        .toNodes(graph, precompiledCodeAssigner.graph.fullTraversal)
        .reduce<Array<GlobalDefinitions>>((definitions, node) => {
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

const _getLocalContext = (
    variableNamesAssigner: VariableNamesIndex,
    globalDefinitions: GlobalDefinitions
) => ({
    ns: _getAssignerNamespace(variableNamesAssigner, globalDefinitions),
})

const _getAssignerNamespace = (
    variableNamesAssigner: VariableNamesIndex,
    globalDefinitions: GlobalDefinitions
) => variableNamesAssigner.globals[globalDefinitions.namespace]!
