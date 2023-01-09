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
import { executeCompilation } from './compile'
import { createEngine, makeCompilation, round } from './test-helpers'
import {
    Signal,
    Message,
    NodeImplementations,
    CompilerTarget,
    FloatArray,
    Code,
    NodeImplementation,
} from './types'
export { executeCompilation } from './compile'
export { makeCompilation } from './test-helpers'

interface NodeTestSettings <NodeArguments>{
    target: CompilerTarget
    node: DspGraph.Node
    nodeImplementation: NodeImplementation<NodeArguments>
    engineDspParams?: typeof ENGINE_DSP_PARAMS
}

export type Frame = {
    [portletId: string]: Array<Message> | Signal
}

export const generateFramesForNode = async <NodeArguments>(
    nodeTestSettings: NodeTestSettings<NodeArguments>,
    inputFrames: Array<Frame>,
    arrays?: { [arrayName: string]: Array<number> }
): Promise<Array<Frame>> => {
    nodeTestSettings.engineDspParams =
        nodeTestSettings.engineDspParams || ENGINE_DSP_PARAMS

    const { target } = nodeTestSettings
    const connectedInlets = new Set<DspGraph.PortletId>([])
    inputFrames.forEach(frame => 
        Object.keys(frame).forEach(
            inletId => connectedInlets.add(inletId)))

    // --------------- Generating test graph
    //   [fakeSourceNode] -> [testNode] -> [fakeSinkNode]
    const { inlets: testNodeInlets, outlets: testNodeOutlets } =
        nodeTestSettings.node

    // Node to send inputs to testNode
    const fakeSourceNode: DspGraph.Node = {
        id: 'fakeSourceNode',
        type: 'fake_source_node',
        args: {},
        sources: {},
        sinks: makeConnectionEndpointMap('testNode', Array.from(connectedInlets)),
        inlets: makeMessagePortlets(Object.keys(testNodeInlets)),
        outlets: testNodeInlets,
        isMessageSource: true,
    }

    // Node to test
    const testNode: DspGraph.Node = {
        ...nodeTestSettings.node,
        id: 'testNode',
        sources: makeConnectionEndpointMap('fakeSourceNode', Array.from(connectedInlets)),
        sinks: makeConnectionEndpointMap('fakeSinkNode', Object.keys(testNodeOutlets)),
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const fakeSinkNode: DspGraph.Node = {
        id: 'fakeSinkNode',
        type: 'fake_sink_node',
        args: {},
        sources: makeConnectionEndpointMap('testNode', Object.keys(testNodeOutlets)),
        sinks: {},
        inlets: testNodeOutlets,
        outlets: makeMessagePortlets(Object.keys(testNodeOutlets)),
        isSignalSink: true,
    }

    const graph: DspGraph.Graph = {
        testNode,
        fakeSinkNode,
        fakeSourceNode,
    }

    // --------------- Generating implementation for testing recorder & engine
    const nodeImplementations: NodeImplementations = {
        [testNode.type]: nodeTestSettings.nodeImplementation,

        'fake_source_node': {
            declare: (_, {state, macros}) => Object.keys(fakeSourceNode.outlets)
                .filter(outletId => fakeSourceNode.outlets[outletId].type === 'signal')
                .map(outletId => `let ${macros.typedVar(state[`VALUE_${outletId}`], 'Float')}`)
                .join('\n'),

            messages: (_, {globs, snds, state}) => Object.keys(fakeSourceNode.outlets)
                .reduce((messageMap, inletId) => {
                    const outletId = inletId
                    let code = ''

                    // Messages received for message outlets are directly proxied
                    if (fakeSourceNode.outlets[outletId].type === 'message') {
                        code = `${snds[outletId]}(${globs.m})`
                    
                    // Messages received for signal outlets are written to the loop
                    } else {
                        code = `${state[`VALUE_${outletId}`]} = msg_readFloatToken(${globs.m}, 0)`
                    }

                    return {
                        ...messageMap,
                        [inletId]: code,
                    }
                }, {} as {[inletId: DspGraph.PortletId]: Code}),
            
            loop: (_, {outs, state}) => Object.keys(fakeSourceNode.outlets)
                .filter(outletId => fakeSourceNode.outlets[outletId].type === 'signal')
                .map(outletId => `${outs[outletId]} = ${state[`VALUE_${outletId}`]}`)
                .join('\n'),

            stateVariables: () => Object.keys(fakeSourceNode.outlets)
                .filter(outletId => fakeSourceNode.outlets[outletId].type === 'signal')
                .map(outletId => `VALUE_${outletId}`)
        },

        'fake_sink_node': {
            // Take incoming signal values and proxy them via message
            loop: (_, { ins, snds }) => Object.keys(testNode.sinks)
                .filter(outletId => testNode.outlets[outletId].type === 'signal')
                .map(outletId =>
                    // prettier-ignore
                    `
                    ${snds[outletId]}(msg_floats([${ins[outletId]}]))
                    `
                ).join('\n'),

            // Take incoming messages and directly proxy them
            messages: (_, {globs, snds}) => Object.keys(fakeSinkNode.inlets)
                .filter(inletId => fakeSinkNode.inlets[inletId].type === 'message')
                .reduce((messageMap, inletId) => ({
                    ...messageMap,
                    [inletId]: `${snds[inletId]}(${globs.m})`,
                }), {} as {[inletId: DspGraph.PortletId]: Code}),
        },
    }

    // --------------- Compile code & engine
    const compilation = makeCompilation({
        target,
        graph,
        nodeImplementations,
        inletCallerSpecs: {
            'fakeSourceNode': Object.keys(fakeSourceNode.inlets)
        },
        outletListenerSpecs: {
            'fakeSinkNode': Object.keys(fakeSinkNode.outlets)
        },
        audioSettings: {
            channelCount: nodeTestSettings.engineDspParams.channelCount,
            bitDepth: 64,
        },
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
    let configured = false
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
        const outputFrame: Frame = {}
        // Set default values for output frame
        Object.values(testNode.outlets).forEach(outlet => {
            if (outlet.type === 'message') {
                outputFrame[outlet.id] = []
            }
        })

        // Set up outletListeners to receive sent messages
        Object.keys(engine.outletListeners['fakeSinkNode']).forEach(outletId => {
            engine.outletListeners['fakeSinkNode'][outletId] = {
                onMessage: (m) => {
                    if (testNode.outlets[outletId].type === 'message') {
                        outputFrame[outletId] = outputFrame[outletId] || []
                        const output = outputFrame[outletId] as Array<Message>
                        output.push(m)
                    } else {
                        outputFrame[outletId] = m[0] as number
                    }
                }
            }
        })

        // We make sure we configure after assigning the outletListeners, so we can receive messages sent
        // during configure.
        if (configured === false) {
            engine.configure(nodeTestSettings.engineDspParams.sampleRate, blockSize)
            configured = true
        }

        // Send in the input frame and run the loop
        Object.entries(inputFrame).forEach(([inletId, value]) => {
            if (testNode.inlets[inletId].type === 'message') {
                if (!Array.isArray(value)) {
                    throw new Error(`unexpected value ${value} of type <${typeof value}> for inlet ${inletId}`)
                }
                value.forEach(
                    message => engine.inletCallers['fakeSourceNode'][inletId](message))
            } else {
                if (typeof value !== 'number') {
                    throw new Error(`unexpected value ${value} of type <${typeof value}> for inlet ${inletId}`)
                }
                engine.inletCallers['fakeSourceNode'][inletId]([value])
            }
        })
        engine.loop(engineInput, engineOutput)
        outputFrames.push(outputFrame)
    })

    // Restoring global scope for assemblyscript compiler
    Object.entries(assemblyscriptGlobals).forEach(([key, glob]) => {
        const g = globalThis as any
        g[key] = glob
    })

    return outputFrames
}

export const assertNodeOutput = async <NodeArguments>(
    nodeTestSettings: NodeTestSettings<NodeArguments>,
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

const makeConnectionEndpointMap = (nodeId: DspGraph.NodeId, portletList: Array<DspGraph.PortletId>) =>
    portletList.reduce<DspGraph.ConnectionEndpointMap>((endpointMap, portletId) => ({
        ...endpointMap,
        [portletId]: [
            { nodeId, portletId },
        ]
    }), {})

const makeMessagePortlets = (portletList: Array<DspGraph.PortletId>) =>
    portletList.reduce<DspGraph.PortletMap>((portletMap, portletId) => ({
        ...portletMap,
        [portletId]: {id: portletId, type: 'message'}
    }), {})