import { EngineAttributes, EvalDspLoop, EvalDspSetup, traverseGraph } from '@webpd/engine-core'
import * as oscTilde from './nodes/osc~'
import * as dacTilde from './nodes/dac~'
import { NodeImplementation, NodeVariableNames, NodeStateVariableNames, NodeStateDeclaration } from './types'

export default async (graph: PdDspGraph.Graph, registry: PdRegistry.Registry, settings: EngineAttributes): Promise<{loop: EvalDspLoop, setup: EvalDspSetup}> => {
    const traversal = traverseGraph(graph, registry)
    let setup = ''
    let loop = ''
    for (let node of traversal) {
        const nodeImplementation = nodeImplementations[node.type]
        if (!nodeImplementation) {
            throw new Error(`node ${node.type} is not implemented`)
        }
        const nodeState = nodeImplementation.declareState(node)
        const nodeVariableNames = generateNodeVariableNames(nodeState, node, registry[node.type])

        // Setup ins and outs
        nodeVariableNames.ins.forEach(inletVarName => {
            setup += `\nlet ${inletVarName} = 0`
        })
        nodeVariableNames.outs.forEach(outletVarName => {
            setup += `\nlet ${outletVarName} = 0`
        })
        
        // Setup state
        setup += '\n' + nodeImplementation.setup(node, nodeVariableNames, settings)

        // Add loop
        loop += nodeImplementation.loop(node, nodeVariableNames, settings)

        Object.entries(node.sinks).forEach(([outletId, sinkAddresses]) => {
            sinkAddresses.forEach(({ id: sinkNodeId, portlet: inletId }) => {
                loop += `\n${generateInletVariableName(sinkNodeId, inletId)} = ${generateOutletVariableName(node.id, outletId)}`
            })
        })
    }
    return Promise.resolve({setup, loop})
}

const generateNodeVariableNames = (
    nodeStateDeclaration: NodeStateDeclaration, 
    node: PdDspGraph.Node,
    nodeTemplate: PdRegistry.NodeTemplate,
) => {
    const nodeVariableNames: NodeVariableNames<NodeStateVariableNames> = {
        ins: [],
        outs: [],
        state: {}
    }
    Object.entries(nodeStateDeclaration).forEach(([localVariableName]) => {
        nodeVariableNames.state[localVariableName] = `${node.id}_STATE_${localVariableName}`
    })
    Object.entries(nodeTemplate.getInletsTemplate(node.args)).forEach(([inletId]) => {
        nodeVariableNames.ins.push(generateInletVariableName(node.id, inletId))
    })
    Object.entries(nodeTemplate.getOutletsTemplate(node.args)).forEach(([outletId]) => {
        nodeVariableNames.outs.push(generateOutletVariableName(node.id, outletId))
    })
    return nodeVariableNames
}

const generateInletVariableName = (nodeId: PdDspGraph.NodeId, inletId: PdSharedTypes.PortletId) => 
    `${nodeId}_INS_${inletId}`

const generateOutletVariableName = (nodeId: PdDspGraph.NodeId, outletId: PdSharedTypes.PortletId) => 
    `${nodeId}_OUTS_${outletId}`

const nodeImplementations: {[nodeType: string]: NodeImplementation} = {
    'osc~': oscTilde,
    'dac~': dacTilde,
}