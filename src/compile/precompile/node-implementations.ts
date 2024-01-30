import { DspGraph } from '../../dsp-graph'
import { Compilation } from '../types'
import { attachNodeImplementationVariable } from '../variable-names-index'

export const precompileStateClass = (
    compilation: Compilation,
    nodeType: DspGraph.NodeType
) => {
    const { precompilation, variableNamesIndex, graph } = compilation
    const { globs } = variableNamesIndex
    const precompiledImplementation =
        precompilation.nodeImplementations[nodeType]

    if (precompiledImplementation.nodeImplementation.state) {
        if (!variableNamesIndex.nodeImplementations[nodeType].stateClass) {
            attachNodeImplementationVariable(
                compilation,
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
        const stateClassName = variableNamesIndex.nodeImplementations[nodeType].stateClass
        const astClass = precompiledImplementation.nodeImplementation.state({
            globs,
            node: sampleNode,
            compilation,
            stateClassName,
        })
        precompilation.nodeImplementations[nodeType].stateClass = {
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
    compilation: Compilation,
    nodeType: DspGraph.NodeType
) => {
    const { precompilation, variableNamesIndex } = compilation
    const { globs } = variableNamesIndex
    const nodeImplementation =
        precompilation.nodeImplementations[nodeType].nodeImplementation
    const stateClassName =
        variableNamesIndex.nodeImplementations[nodeType].stateClass || undefined
    if (nodeImplementation.core) {
        precompilation.nodeImplementations[nodeType].core =
            nodeImplementation.core({
                compilation,
                globs,
                stateClassName,
            })
    }
}
