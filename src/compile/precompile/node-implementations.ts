import { DspGraph } from '../../dsp-graph'
import { PrecompilationOperation } from './types'
import { attachNodeImplementationVariable } from './variable-names-index'

export const precompileStateClass = (
    { input: { graph, settings }, output }: PrecompilationOperation,
    nodeType: DspGraph.NodeType
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const precompiledImplementation = output.nodeImplementations[nodeType]

    if (precompiledImplementation.nodeImplementation.state) {
        if (!variableNamesIndex.nodeImplementations[nodeType].stateClass) {
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
            variableNamesIndex.nodeImplementations[nodeType].stateClass
        const astClass = precompiledImplementation.nodeImplementation.state({
            globs,
            node: sampleNode,
            settings,
            stateClassName,
        })
        output.nodeImplementations[nodeType].stateClass = {
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
    { input: { settings }, output }: PrecompilationOperation,
    nodeType: DspGraph.NodeType
) => {
    const { variableNamesIndex } = output
    const { globs } = variableNamesIndex
    const nodeImplementation =
        output.nodeImplementations[nodeType].nodeImplementation
    const stateClassName =
        variableNamesIndex.nodeImplementations[nodeType].stateClass || undefined
    if (nodeImplementation.core) {
        output.nodeImplementations[nodeType].core = nodeImplementation.core({
            settings,
            globs,
            stateClassName,
        })
    }
}
