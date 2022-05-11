import { generateInletVariableName } from './variable-names'
import { PortsNames } from './types'

type PortCall = [PortsNames, any]

export const setInlet = (
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    message: PdSharedTypes.ControlValue
): PortCall => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    return [PortsNames.SET_VARIABLE, [inletVariableName, [message]]]
}
