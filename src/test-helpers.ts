import {
    buildDspEngine,
    NodeSummary,
} from '@webpd/engine-core/src/eval-engine/test-helpers'
import DEFAULT_REGISTRY from '@webpd/dsp-graph/src/default-registry'
import { DspEngine } from '@webpd/engine-core/src/eval-engine/types'
import generate from './generate'
import NODE_IMPLEMENTATIONS from './nodes'
import { NodeImplementations, PortsNames } from './types'
import {
    generateInletVariableName,
    generateStateVariableName,
} from './variable-names'

type GenericInletValue =
    | PdSharedTypes.SignalValue
    | Array<PdSharedTypes.ControlValue>

const setEngineNodeInlet = (
    dspEngine: DspEngine,
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    dspEngine.ports[PortsNames.SET_VARIABLE](inletVariableName, value)
}

const getEngineNodeState = (
    dspEngine: DspEngine,
    nodeId: PdDspGraph.NodeId,
    name: string
) => {
    const variableName = generateStateVariableName(nodeId, name)
    return dspEngine.ports[PortsNames.GET_VARIABLE](variableName)
}

type Frame = {
    [portletId: string]:
        | Array<PdSharedTypes.ControlValue>
        | PdSharedTypes.SignalValue
}

export const generateFramesForNode = async (
    nodeSummary: NodeSummary,
    inputFrames: Array<Frame>
): Promise<Array<Frame>> => {
    // --------------- Generating test graph
    const testNodeInlets = DEFAULT_REGISTRY[nodeSummary.type].buildInlets(
        nodeSummary.args
    )
    const testNodeOutlets = DEFAULT_REGISTRY[nodeSummary.type].buildOutlets(
        nodeSummary.args
    )

    const recorderNodeSources: PdDspGraph.ConnectionEndpointMap = {}
    const testNodeSinks: PdDspGraph.ConnectionEndpointMap = {}

    Object.entries(testNodeOutlets).forEach(([outletId]) => {
        testNodeSinks[outletId] = [
            { nodeId: 'recorderNode', portletId: outletId },
        ]
        recorderNodeSources[outletId] = [
            { nodeId: 'testNode', portletId: outletId },
        ]
    })

    // Node to test
    const testNode: PdDspGraph.Node = {
        ...nodeSummary,
        id: 'testNode',
        sources: {},
        sinks: testNodeSinks,
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const recorderNode: PdDspGraph.Node = {
        id: 'recorderNode',
        type: 'testing-recorder',
        args: {},
        sources: recorderNodeSources,
        sinks: {},
        inlets: testNode.outlets,
        outlets: {},
        isEndSink: true,
    }

    const graph: PdDspGraph.Graph = {
        testNode: testNode,
        recorderNode: recorderNode,
    }

    // --------------- Generating implementation for testing recorder & dsp engine
    const nodeImplementations: NodeImplementations = {
        ...NODE_IMPLEMENTATIONS,
        'testing-recorder': {
            // Generate one memory variable per outlet of test node
            setup: (_, { state }) =>
                Object.keys(recorderNode.inlets)
                    .map(
                        (inletId) => `
                let ${state('mem' + inletId)} = null
            `
                    )
                    .join('\n'),
            // For each outlet of test node, save the output value in corresponding memory.
            // This is necessary cause engine clears outlets at each run of loop.
            loop: (_, { state, ins }) =>
                Object.keys(recorderNode.inlets)
                    .map(
                        (inletId) => `
                ${state('mem' + inletId)} = ${ins(inletId)}.slice ? ${ins(
                            inletId
                        )}.slice(0) : ${ins(inletId)}
            `
                    )
                    .join('\n'),
        },
    }

    const dspEngineString = await generate(graph, nodeImplementations, {
        sampleRate: 44100,
        channelCount: 2,
    })
    const dspEngine = buildDspEngine(dspEngineString)

    // --------------- Generate frames
    const outputFrames: Array<Frame> = []
    inputFrames.map((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) =>
            setEngineNodeInlet(dspEngine, testNode.id, inletId, value)
        )

        dspEngine.loop()

        const outputFrame: Frame = {}
        Object.keys(recorderNode.inlets).forEach((inletId) => {
            outputFrame[inletId] = getEngineNodeState(
                dspEngine,
                recorderNode.id,
                'mem' + inletId
            )
        })
        outputFrames.push(outputFrame)
    })

    return outputFrames
}
