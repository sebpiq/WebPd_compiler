import { callPort } from '@webpd/engine-core/src/eval-engine'
import { Engine } from '@webpd/engine-core/src/eval-engine/types'
import { generateInletVariableName } from './variable-names'
import { PortsNames } from './types'

export const sendMessage = (
    engine: Engine,
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    message: PdSharedTypes.ControlValue
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    callPort(engine, PortsNames.SET_VARIABLE, [inletVariableName, [message]])
}