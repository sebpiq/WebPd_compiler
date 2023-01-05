/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from 'assert'
import { DspGraph } from '@webpd/dsp-graph'
import { getMacros, executeCompilation } from './compile'
import { renderCode } from './compile-helpers'
import { createEngine, makeCompilation, round } from './test-helpers'
import {
    Signal,
    Message,
    Engine,
    NodeImplementations,
    AccessorSpecs,
    CompilerTarget,
    FloatArray,
} from './types'
export { executeCompilation } from './compile'
export { makeCompilation } from './test-helpers'

interface NodeTestSettings {
    target: CompilerTarget
    node: DspGraph.Node
    nodeImplementations: NodeImplementations
    connectedSources?: Array<DspGraph.PortletId>
    engineDspParams?: typeof ENGINE_DSP_PARAMS
}

type GenericInletValue = Signal | Array<Message>

const setNodeInlet = (
    engine: Engine,
    nodeId: DspGraph.NodeId,
    inletId: DspGraph.PortletId,
    value: GenericInletValue
) => {
    const inletVariableName = `${nodeId}_INS_${inletId}`
    engine.accessors[`write_${inletVariableName}`](value)
}

const setNodeOutlet = (
    engine: Engine,
    nodeId: DspGraph.NodeId,
    outletId: DspGraph.PortletId,
    value: GenericInletValue
) => {
    const outletVariableName = `${nodeId}_OUTS_${outletId}`
    engine.accessors[`write_${outletVariableName}`](value)
}

const getNodeState = (
    engine: Engine,
    nodeId: DspGraph.NodeId,
    name: string
) => {
    const variableName = `${nodeId}_STATE_${name}`
    return engine.accessors[`read_${variableName}`]()
}

export type Frame = {
    [portletId: string]: Array<Message> | Signal
}

export const generateFramesForNode = async (
    nodeTestSettings: NodeTestSettings,
    inputFrames: Array<Frame>,
    arrays?: { [arrayName: string]: Array<number> }
): Promise<Array<Frame>> => {
    nodeTestSettings.engineDspParams =
        nodeTestSettings.engineDspParams || ENGINE_DSP_PARAMS

    const _isConnectedToFakeNode = (inletId: DspGraph.PortletId) =>
        testNode.sources[inletId] &&
        testNode.sources[inletId].filter(
            (source) => source.nodeId === fakeSourceNode.id
        ).length

    const { target } = nodeTestSettings

    // --------------- Generating test graph
    //   [fakeSourceNode] -> [testNode] -> [recorderNode]
    const { inlets: testNodeInlets, outlets: testNodeOutlets } =
        nodeTestSettings.node

    const fakeSourceNodeSinks: DspGraph.ConnectionEndpointMap = {}
    const testNodeSources: DspGraph.ConnectionEndpointMap = {}
    const testNodeSinks: DspGraph.ConnectionEndpointMap = {}
    const recorderNodeSources: DspGraph.ConnectionEndpointMap = {}

    Object.values(testNodeOutlets).forEach((outlet) => {
        testNodeSinks[outlet.id] = [
            { nodeId: 'recorderNode', portletId: outlet.id },
        ]
        recorderNodeSources[outlet.id] = [
            { nodeId: 'testNode', portletId: outlet.id },
        ]
    })

    if (nodeTestSettings.connectedSources) {
        nodeTestSettings.connectedSources.forEach((portletId) => {
            testNodeSources[portletId] = [
                { nodeId: 'fakeSourceNode', portletId },
            ]
            fakeSourceNodeSinks[portletId] = [{ nodeId: 'testNode', portletId }]
        })
    }

    // Fake source, only useful for simultating connections
    // to the node we want to test.
    // Ignored if no fake connections are declared
    const fakeSourceNode: DspGraph.Node = {
        id: 'fakeSourceNode',
        type: 'fake-source-node',
        args: {},
        sources: {},
        sinks: fakeSourceNodeSinks,
        inlets: {},
        outlets: testNodeInlets,
    }

    // Node to test
    const testNode: DspGraph.Node = {
        ...nodeTestSettings.node,
        id: 'testNode',
        sources: testNodeSources,
        sinks: testNodeSinks,
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const recorderNode: DspGraph.Node = {
        id: 'recorderNode',
        type: 'recorder-node',
        args: {},
        sources: recorderNodeSources,
        sinks: {},
        inlets: testNode.outlets,
        outlets: {},
        isEndSink: true,
    }

    const graph: DspGraph.Graph = {
        testNode,
        recorderNode,
        fakeSourceNode,
    }

    // --------------- Generating implementation for testing recorder & engine
    const nodeImplementations: NodeImplementations = {
        ...nodeTestSettings.nodeImplementations,
        // This is a dummy node, it's only useful to fake connections
        'fake-source-node': {
            loop: () => ``,
        },
        'recorder-node': {
            // Generate one memory variable per outlet of test node
            declare: (_, { state, macros }) =>
                renderCode`${Object.values(recorderNode.inlets).map((inlet) =>
                    inlet.type === 'signal'
                        ? `let ${macros.typedVar(
                              state['mem' + inlet.id],
                              'Float'
                          )} = 0`
                        : `let ${macros.typedVar(
                              state['mem' + inlet.id],
                              'Array<Message>'
                          )} = []`
                )}`,
            // For each outlet of test node, save the output value in corresponding memory.
            // This is necessary cause engine clears outlets at each run of loop.
            loop: (_, { state, ins }) =>
                renderCode`${Object.values(recorderNode.inlets).map((inlet) =>
                    inlet.type === 'signal'
                        ? `${state['mem' + inlet.id]} = ${ins[inlet.id]}`
                        : `${state['mem' + inlet.id]} = ${
                              ins[inlet.id]
                          }.slice(0)`
                )}`,
            stateVariables: Object.keys(recorderNode.inlets).map(
                (inletId) => 'mem' + inletId
            ),
        },
    }

    // --------------- Compile code & engine
    const accessorSpecs: AccessorSpecs = {}
    inputFrames.forEach((inputFrame) => {
        // Ports to write input values
        Object.keys(inputFrame).forEach((inletId) => {
            const inlet = testNode.inlets[inletId]
            const inletVariableName = `${testNode.id}_INS_${inletId}`
            accessorSpecs[inletVariableName] = { access: 'w', type: inlet.type }

            // We need a port to write to the output of the fakeSourceNode only if it is connected
            if (_isConnectedToFakeNode(inletId)) {
                const outletVariableName = `${fakeSourceNode.id}_OUTS_${inletId}`
                accessorSpecs[outletVariableName] = {
                    access: 'w',
                    type: inlet.type,
                }
            }
        })

        // Ports to read output values
        Object.entries(recorderNode.inlets).forEach(([inletId, inlet]) => {
            const variableName = `${recorderNode.id}_STATE_${'mem' + inletId}`
            accessorSpecs[variableName] = {
                access: 'r',
                type: inlet.type,
            }
        })
    })

    const compilation = makeCompilation({
        target,
        graph,
        nodeImplementations,
        macros: getMacros(target),
        audioSettings: {
            channelCount: nodeTestSettings.engineDspParams.channelCount,
            bitDepth: 64,
        },
        accessorSpecs,
    })
    const code = executeCompilation(compilation)
    const engine = await createEngine(compilation.target, code)

    if (arrays) {
        Object.entries(arrays).forEach(([arrayName, data]) => {
            engine.setArray(arrayName, data)
        })
    }

    // --------------- Generate frames

    // Cleaning global scope polluted by assemblyscript compiler.
    // Some functions such as f32 and i32 are defined globally by assemblyscript compiler
    // That could cause some interference with our JS code that is executed through eval,
    // (e.g. if a `f32` has been forgotten in the code generator of a node, code should fail,
    // but it won't because f32 exists globally).
    // so we remove these globals before running the tests.
    const assemblyscriptGlobalKeys = ['i32', 'f32', 'f64']
    const assemblyscriptGlobals: any = {}
    assemblyscriptGlobalKeys.forEach((key) => {
        const g = globalThis as any
        assemblyscriptGlobals[key] = g[key]
        g[key] = undefined
    })

    const blockSize = 1
    engine.configure(nodeTestSettings.engineDspParams.sampleRate, blockSize)

    const outputFrames: Array<Frame> = []
    const engineInput = buildEngineBlock(
        Float32Array,
        nodeTestSettings.engineDspParams.channelCount.in,
        blockSize
    )
    const engineOutput = buildEngineBlock(
        Float32Array,
        nodeTestSettings.engineDspParams.channelCount.out,
        blockSize
    )

    inputFrames.forEach((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) => {
            // TODO : if working set only inlet
            // We set the inlets with our simulation values.
            setNodeInlet(
                engine,
                testNode.id,
                inletId,
                Array.isArray(value) ? value.slice(0) : value
            )

            if (_isConnectedToFakeNode(inletId)) {
                // We set the outlets of fake source node, because if inlets are connected,
                // the loop will copy over simulation values set just above.
                // !!! setting value is done by reference, so we need to copy the array
                // to not assign the same the inlet
                setNodeOutlet(
                    engine,
                    fakeSourceNode.id,
                    inletId,
                    Array.isArray(value) ? value.slice(0) : value
                )
            }
        })

        const outputFrame: Frame = {}
        engine.loop(engineInput, engineOutput)

        Object.keys(recorderNode.inlets).forEach((inletId) => {
            outputFrame[inletId] = getNodeState(
                engine,
                recorderNode.id,
                'mem' + inletId
            )
        })
        outputFrames.push(outputFrame)
    })

    // Restoring global scope for assemblyscript compiler
    Object.entries(assemblyscriptGlobals).forEach(([key, glob]) => {
        const g = globalThis as any
        g[key] = glob
    })

    return outputFrames
}

export const assertNodeOutput = async (
    nodeTestSettings: NodeTestSettings,
    inputFrames: Array<Frame>,
    expectedOutputFrames: Array<Frame>,
    arrays?: { [arrayName: string]: Array<number> }
): Promise<void> => {
    let actualOutputFrames: Array<Frame>
    actualOutputFrames = await generateFramesForNode(
        nodeTestSettings,
        inputFrames,
        arrays
    )
    assert.deepStrictEqual(
        roundFloatsInFrames(actualOutputFrames),
        roundFloatsInFrames(expectedOutputFrames)
    )
}

const roundFloatsInFrames = (frames: Array<Frame>) =>
    frames.map((frame) => {
        const roundDecimal = 5
        const roundedFrame: Frame = {}
        Object.entries(frame).forEach(([portletId, arrayOrSignal]) => {
            if (Array.isArray(arrayOrSignal)) {
                roundedFrame[portletId] = arrayOrSignal.map((value) => {
                    if (typeof value === 'number') {
                        return round(value, roundDecimal) as any
                    }
                    return value
                })
            } else {
                roundedFrame[portletId] = round(arrayOrSignal, roundDecimal)
            }
        })
        return roundedFrame
    })

export const buildEngineBlock = (
    constructor: typeof Float32Array | typeof Float64Array,
    channelCount: number,
    blockSize: number
) => {
    const engineOutput: Array<FloatArray> = []
    for (let channel = 0; channel < channelCount; channel++) {
        engineOutput.push(new constructor(blockSize))
    }
    return engineOutput
}

export const ENGINE_DSP_PARAMS = {
    sampleRate: 44100,
    channelCount: { in: 2, out: 2 },
}
