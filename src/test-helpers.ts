import { buildSignalProcessor } from '@webpd/engine-live-eval/src/utils'
import {NODE_BUILDERS} from '@webpd/dsp-graph'
import compile from './compile'
import NODE_IMPLEMENTATIONS from './nodes'
import { NodeImplementations, PortsNames } from './types'
import {
    generateInletVariableName,
    generateStateVariableName,
} from './variable-names'

type NodeSummary = Pick<PdDspGraph.Node, 'type' | 'args'>

type GenericInletValue =
    | PdSharedTypes.SignalValue
    | Array<PdSharedTypes.ControlValue>

const setNodeInlet = (
    processor: PdEngine.SignalProcessor,
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    processor.ports[PortsNames.SET_VARIABLE](inletVariableName, value)
}

const getNodeState = (
    processor: PdEngine.SignalProcessor,
    nodeId: PdDspGraph.NodeId,
    name: string
) => {
    const variableName = generateStateVariableName(nodeId, name)
    return processor.ports[PortsNames.GET_VARIABLE](variableName)
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
    const { inlets: testNodeInlets, outlets: testNodeOutlets } = NODE_BUILDERS[nodeSummary.type].build(
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

    // --------------- Generating implementation for testing recorder & processor
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

    const code = await compile(graph, nodeImplementations, COMPILE_SETTINGS)
    const processor = buildSignalProcessor(code)

    // --------------- Generate frames
    const outputFrames: Array<Frame> = []
    inputFrames.map((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) =>
            setNodeInlet(processor, testNode.id, inletId, value)
        )

        processor.loop()

        const outputFrame: Frame = {}
        Object.keys(recorderNode.inlets).forEach((inletId) => {
            outputFrame[inletId] = getNodeState(
                processor,
                recorderNode.id,
                'mem' + inletId
            )
        })
        outputFrames.push(outputFrame)
    })

    return outputFrames
}

export const COMPILE_SETTINGS = {
    sampleRate: 44100,
    channelCount: 2,
    arraysVariableName: 'WEBPD_ARRAYS',
}
