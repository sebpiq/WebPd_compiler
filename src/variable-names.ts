import { VariableNameGenerators } from './types'

export default (node: PdDspGraph.Node): VariableNameGenerators => ({
    ins: generateInletVariableName.bind(undefined, node.id),
    outs: generateOutletVariableName.bind(undefined, node.id),
    state: generateStateVariableName.bind(undefined, node.id),
})

export const generateInletVariableName = (
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId
) => `${nodeId}_INS_${inletId}`

export const generateOutletVariableName = (
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId
) => `${nodeId}_OUTS_${outletId}`

export const generateStateVariableName = (
    nodeId: PdDspGraph.NodeId,
    localVariableName: PdDspGraph.PortletId
) => `${nodeId}_STATE_${localVariableName}`
