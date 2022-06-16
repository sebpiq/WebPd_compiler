import { buildSignalProcessor } from '@webpd/engine-live-eval/src/utils'
import { NODE_BUILDERS } from '@webpd/dsp-graph'
import compile from './compile'
import NODE_IMPLEMENTATIONS from './nodes'
import { NodeImplementations, PortsNames } from './types'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'

interface NodeSummary {
    type: PdDspGraph.Node['type']
    args: PdDspGraph.Node['args']
    connectedSources?: Array<PdDspGraph.PortletId>
}

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

const setNodeOutlet = (
    processor: PdEngine.SignalProcessor,
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const outletVariableName = generateOutletVariableName(nodeId, outletId)
    processor.ports[PortsNames.SET_VARIABLE](outletVariableName, value)
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

export const generateFramesForNode = (
    nodeSummary: NodeSummary,
    inputFrames: Array<Frame>
): Array<Frame> => {
    // --------------- Generating test graph
    //   [fakeSourceNode] -> [testNode] -> [recorderNode]
    const { inlets: testNodeInlets, outlets: testNodeOutlets } = NODE_BUILDERS[
        nodeSummary.type
    ].build(nodeSummary.args)

    const fakeSourceNodeSinks: PdDspGraph.ConnectionEndpointMap = {}
    const testNodeSources: PdDspGraph.ConnectionEndpointMap = {}
    const testNodeSinks: PdDspGraph.ConnectionEndpointMap = {}
    const recorderNodeSources: PdDspGraph.ConnectionEndpointMap = {}

    Object.entries(testNodeOutlets).forEach(([outletId]) => {
        testNodeSinks[outletId] = [
            { nodeId: 'recorderNode', portletId: outletId },
        ]
        recorderNodeSources[outletId] = [
            { nodeId: 'testNode', portletId: outletId },
        ]
    })

    if (nodeSummary.connectedSources) {
        nodeSummary.connectedSources.forEach((portletId) => {
            testNodeSources[portletId] = [
                { nodeId: 'fakeSourceNode', portletId },
            ]
            fakeSourceNodeSinks[portletId] = [{ nodeId: 'testNode', portletId }]
        })
    }

    // Fake source, only useful for simultating connections
    // to the node we want to test
    const fakeSourceNode: PdDspGraph.Node = {
        id: 'fakeSourceNode',
        type: 'fake-source-node',
        args: {},
        sources: {},
        sinks: fakeSourceNodeSinks,
        inlets: {},
        outlets: testNodeInlets,
    }

    // Node to test
    const testNode: PdDspGraph.Node = {
        ...nodeSummary,
        id: 'testNode',
        sources: testNodeSources,
        sinks: testNodeSinks,
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const recorderNode: PdDspGraph.Node = {
        id: 'recorderNode',
        type: 'recorder-node',
        args: {},
        sources: recorderNodeSources,
        sinks: {},
        inlets: testNode.outlets,
        outlets: {},
        isEndSink: true,
    }

    const graph: PdDspGraph.Graph = {
        testNode,
        recorderNode,
        fakeSourceNode,
    }

    // --------------- Generating implementation for testing recorder & processor
    const nodeImplementations: NodeImplementations = {
        ...NODE_IMPLEMENTATIONS,
        // This is a dummy node, it's only useful to fake connections
        'fake-source-node': {
            setup: () => ``,
            loop: () => ``,
        },
        'recorder-node': {
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

    const code = compile(graph, nodeImplementations, COMPILE_SETTINGS)
    const processor = buildSignalProcessor(code)

    // --------------- Generate frames
    const outputFrames: Array<Frame> = []
    inputFrames.map((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) => {
            // We set the inlets with our simulation values.
            setNodeInlet(processor, testNode.id, inletId, value)

            // We set the outlets of fake source node, because if inlets are connected,
            // the loop will copy over simulation values set just above.
            // !!! setting value is done by reference, so we need to copy the array
            // to not assign the same the inlet
            setNodeOutlet(
                processor,
                fakeSourceNode.id,
                inletId,
                Array.isArray(value) ? value.slice(0) : value
            )
        })

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
