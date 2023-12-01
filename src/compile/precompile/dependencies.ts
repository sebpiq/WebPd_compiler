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