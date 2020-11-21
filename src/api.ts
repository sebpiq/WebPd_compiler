import { callPort } from "@webpd/engine-core/src/eval-engine";
import { Engine } from "@webpd/engine-core/src/types";
import { generateInletVariableName } from "./generate";
import { PortsNames } from "./types";

export const sendMessage = (
    engine: Engine, 
    nodeId: PdDspGraph.NodeId,
    inletId: PdSharedTypes.PortletId, 
    message: PdSharedTypes.ControlMessage
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    callPort(engine, PortsNames.SET_VARIABLE, [inletVariableName, message])
}