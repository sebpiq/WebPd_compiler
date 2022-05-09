import {
  buildDspEngine,
  generateFrames,
  getGraphForSingleNode,
  GRAPH_FOR_NODE_TEST_NODE_ID,
  NodeSummary,
} from "@webpd/engine-core/src/eval-engine/test-helpers";
import { DspEngine } from "@webpd/engine-core/src/eval-engine/types";
import generate from "./generate";
import NODE_IMPLEMENTATIONS from "./nodes";
import { PortsNames } from "./types";
import { generateInletVariableName } from "./variable-names";

type GenericInletValue = PdSharedTypes.SignalValue | Array<PdSharedTypes.ControlValue>

export const setInlet = (
  dspEngine: DspEngine,
  nodeId: PdDspGraph.NodeId,
  inletId: PdSharedTypes.PortletId,
  value: GenericInletValue
) => {
  const inletVariableName = generateInletVariableName(nodeId, inletId);
  dspEngine.ports[PortsNames.SET_VARIABLE](inletVariableName, value);
};

export const generateFramesForNode = async (
    nodeSummary: NodeSummary,
    inletValues: Array<Array<GenericInletValue>>,
) => {
  const graph = getGraphForSingleNode(nodeSummary);
  const dspEngineString = await generate(graph, NODE_IMPLEMENTATIONS, {
    sampleRate: 44100,
    channelCount: 2,
  });
  const dspEngine = buildDspEngine(dspEngineString);

  generateFrames(
    dspEngine,
    // For each from, for each inlet, set the inlet's values
    inletValues.map(
      (valuesArray) => () =>
        valuesArray.forEach((value, inletId) =>
          setInlet(
            dspEngine,
            GRAPH_FOR_NODE_TEST_NODE_ID,
            inletId.toString(10),
            value
          )
        )
    )
  );
  return frames;
};
