import { VariableNameGenerators } from './types'

export default (node: PdDspGraph.Node): VariableNameGenerators => ({
    ins: generateInletVariableName.bind(undefined, node.id),
    outs: generateOutletVariableName.bind(undefined, node.id),
    state: generateStateVariableName.bind(undefined, node.id),
})

export const generateInletVariableName = (
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId
) => `${assertValidNamePart(nodeId)}_INS_${assertValidNamePart(inletId)}`

export const generateOutletVariableName = (
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId
) => `${assertValidNamePart(nodeId)}_OUTS_${assertValidNamePart(outletId)}`

export const generateStateVariableName = (
    nodeId: PdDspGraph.NodeId,
    localVariableName: PdDspGraph.PortletId
) =>
    `${assertValidNamePart(nodeId)}_STATE_${assertValidNamePart(
        localVariableName
    )}`

export const assertValidNamePart = (namePart: string) => {
    const isInvalid = !VALID_NAME_PART_REGEXP.exec(namePart)
    if (isInvalid) {
        throw new Error(
            `Invalid variable name for code generation "${namePart}"`
        )
    }
    return namePart
}

const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/
