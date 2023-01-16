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
    Engine,
    AudioSettings,
} from './types'
import { writeFile } from 'fs/promises'
export { executeCompilation } from './compile'
export { makeCompilation } from './test-helpers'

interface NodeTestSettings<NodeArguments, NodeState> {
    target: CompilerTarget
    node: DspGraph.Node
    nodeImplementation: NodeImplementation<NodeArguments, NodeState>
    bitDepth: AudioSettings['bitDepth']
    arrays?: { [arrayName: string]: Array<number> }
}

type Frame = {
    fs?: {
        [FsFuncName in keyof Engine['fs']]?: Parameters<
            Engine['fs'][FsFuncName]
        >
    }
}
type FrameIn = Frame & {
    tarray?: {
        get?: Array<string>
        set?: { [arrayName: string]: Array<number> }
    }
    ins?: { [portletId: string]: Array<Message> | Signal }
}
export type FrameOut = Frame & {
    tarray?: {
        get?: { [arrayName: string]: Array<number> }
    }
    outs: { [portletId: string]: Array<Message> | Signal }
}

export const generateFramesForNode = async <NodeArguments, NodeState>(
    nodeTestSettings: NodeTestSettings<NodeArguments, NodeState>,
    inputFrames: Array<FrameIn>
): Promise<Array<FrameOut>> => {
    const { target, arrays, bitDepth } = nodeTestSettings
    const connectedInlets = new Set<DspGraph.PortletId>([])
    inputFrames.forEach((frame) =>
        Object.keys(frame.ins || {}).forEach((inletId) =>
            connectedInlets.add(inletId)
        )
    )

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
        sinks: makeConnectionEndpointMap(
            'testNode',
            Array.from(connectedInlets)
        ),
        inlets: makeMessagePortlets(Object.keys(testNodeInlets)),
        outlets: testNodeInlets,
        isMessageSource: true,
    }

    // Node to test
    const testNode: DspGraph.Node = {
        ...nodeTestSettings.node,
        id: 'testNode',
        sources: makeConnectionEndpointMap(
            'fakeSourceNode',
            Array.from(connectedInlets)
        ),
        sinks: makeConnectionEndpointMap(
            'fakeSinkNode',
            Object.keys(testNodeOutlets)
        ),
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const fakeSinkNode: DspGraph.Node = {
        id: 'fakeSinkNode',
        type: 'fake_sink_node',
        args: {},
        sources: makeConnectionEndpointMap(
            'testNode',
            Object.keys(testNodeOutlets)
        ),
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

        fake_source_node: {
            declare: ({ state, macros }) =>
                Object.keys(fakeSourceNode.outlets)
                    .filter(
                        (outletId) =>
                            fakeSourceNode.outlets[outletId].type === 'signal'
                    )
                    .map(
                        (outletId) =>
                            `let ${macros.typedVar(
                                state[`VALUE_${outletId}`],
                                'Float'
                            )}`
                    )
                    .join('\n'),

            messages: ({ globs, snds, state }) =>
                Object.keys(fakeSourceNode.outlets).reduce(
                    (messageMap, inletId) => {
                        const outletId = inletId
                        let code = ''

                        // Messages received for message outlets are directly proxied
                        if (
                            fakeSourceNode.outlets[outletId].type === 'message'
                        ) {
                            code = `${snds[outletId]}(${globs.m})`

                            // Messages received for signal outlets are written to the loop
                        } else {
                            code = `${
                                state[`VALUE_${outletId}`]
                            } = msg_readFloatToken(${globs.m}, 0)`
                        }

                        return {
                            ...messageMap,
                            [inletId]: code,
                        }
                    },
                    {} as { [inletId: DspGraph.PortletId]: Code }
                ),

            loop: ({ outs, state }) =>
                Object.keys(fakeSourceNode.outlets)
                    .filter(
                        (outletId) =>
                            fakeSourceNode.outlets[outletId].type === 'signal'
                    )
                    .map(
                        (outletId) =>
                            `${outs[outletId]} = ${state[`VALUE_${outletId}`]}`
                    )
                    .join('\n'),

            stateVariables: Object.keys(fakeSourceNode.outlets)
                .filter(
                    (outletId) =>
                        fakeSourceNode.outlets[outletId].type === 'signal'
                )
                .reduce((stateVariables, outletId) => {
                    stateVariables[`VALUE_${outletId}`] = 1
                    return stateVariables
                }, {} as { [name: string]: 1 }),
        },

        fake_sink_node: {
            // Take incoming signal values and proxy them via message
            loop: ({ ins, snds }) =>
                Object.keys(testNode.sinks)
                    .filter(
                        (outletId) =>
                            testNode.outlets[outletId].type === 'signal'
                    )
                    .map(
                        (outletId) =>
                            // prettier-ignore
                            `${snds[outletId]}(msg_floats([${ins[outletId]}]))`
                    )
                    .join('\n'),

            // Take incoming messages and directly proxy them
            messages: ({ globs, snds }) =>
                Object.keys(fakeSinkNode.inlets)
                    .filter(
                        (inletId) =>
                            fakeSinkNode.inlets[inletId].type === 'message'
                    )
                    .reduce(
                        (messageMap, inletId) => ({
                            ...messageMap,
                            [inletId]: `${snds[inletId]}(${globs.m})`,
                        }),
                        {} as { [inletId: DspGraph.PortletId]: Code }
                    ),
        },
    }

    // --------------- Compile code & engine
    const compilation = makeCompilation({
        target,
        graph,
        nodeImplementations,
        inletCallerSpecs: {
            fakeSourceNode: Object.keys(fakeSourceNode.inlets),
        },
        outletListenerSpecs: {
            fakeSinkNode: Object.keys(fakeSinkNode.outlets),
        },
        audioSettings: {
            channelCount: ENGINE_DSP_PARAMS.channelCount,
            bitDepth,
        },
    })
    const code = executeCompilation(compilation)
    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${
            compilation.target === 'javascript' ? 'js' : 'asc'
        }`,
        code
    )

    const engine = await createEngine(compilation.target, bitDepth, code)

    if (arrays) {
        Object.entries(arrays).forEach(([arrayName, data]) => {
            engine.tarray.set(arrayName, data)
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
    const outputFrames: Array<FrameOut> = []
    const engineInput = buildEngineBlock(
        Float32Array,
        ENGINE_DSP_PARAMS.channelCount.in,
        blockSize
    )
    const engineOutput = buildEngineBlock(
        Float32Array,
        ENGINE_DSP_PARAMS.channelCount.out,
        blockSize
    )

    inputFrames.forEach((inputFrame) => {
        const outputFrame: FrameOut = { outs: {} }
        // Set default values for output frame
        Object.values(testNode.outlets).forEach((outlet) => {
            if (outlet.type === 'message') {
                outputFrame.outs[outlet.id] = []
            }
        })

        // Set up listeners for fs
        const _ensureFs = () => {
            outputFrame.fs = outputFrame.fs || {}
            return outputFrame.fs
        }
        engine.fs.onCloseSoundStream = (...args) =>
            (_ensureFs()['onCloseSoundStream'] = args)
        engine.fs.onOpenSoundReadStream = (...args) =>
            (_ensureFs()['onOpenSoundReadStream'] = args)
        engine.fs.onOpenSoundWriteStream = (...args) =>
            (_ensureFs()['onOpenSoundWriteStream'] = args)
        engine.fs.onReadSoundFile = (...args) =>
            (_ensureFs()['onReadSoundFile'] = args)
        engine.fs.onSoundStreamData = (...args) =>
            (_ensureFs()['onSoundStreamData'] = args)
        engine.fs.onWriteSoundFile = (...args) =>
            (_ensureFs()['onWriteSoundFile'] = args)

        // Set up outletListeners to receive sent messages
        Object.keys(engine.outletListeners['fakeSinkNode']).forEach(
            (outletId) => {
                engine.outletListeners['fakeSinkNode'][outletId] = {
                    onMessage: (m) => {
                        if (testNode.outlets[outletId].type === 'message') {
                            outputFrame.outs[outletId] =
                                outputFrame.outs[outletId] || []
                            const output = outputFrame.outs[
                                outletId
                            ] as Array<Message>
                            output.push(m)
                        } else {
                            outputFrame.outs[outletId] = m[0] as number
                        }
                    },
                }
            }
        )

        // We make sure we configure AFTER assigning the outletListeners,
        // so we can receive messages sent during configure.
        if (configured === false) {
            engine.configure(ENGINE_DSP_PARAMS.sampleRate, blockSize)
            configured = true
        }

        // Send in fs commands
        if (inputFrame.fs) {
            Object.entries(inputFrame.fs).forEach(([funcName, args]) => {
                engine.fs[funcName as keyof FrameIn['fs']].apply(null, args)
            })
        }

        // Get requested arrays
        if (inputFrame.tarray) {
            if (inputFrame.tarray.get) {
                outputFrame.tarray = {}
                outputFrame.tarray.get = {}
                inputFrame.tarray.get.forEach((arrayName) => {
                    outputFrame.tarray.get[arrayName] = Array.from(
                        engine.tarray.get(arrayName)
                    )
                })
            }
            if (inputFrame.tarray.set) {
                Object.entries(inputFrame.tarray.set).forEach(
                    ([arrayName, array]) => {
                        engine.tarray.set(arrayName, array)
                    }
                )
            }
        }

        // Send in the input frame
        Object.entries(inputFrame.ins || {}).forEach(([inletId, value]) => {
            if (!testNode.inlets[inletId]) {
                throw new Error(
                    `Unknown inlet ${inletId} for node ${testNode.type}`
                )
            } else if (testNode.inlets[inletId].type === 'message') {
                if (!Array.isArray(value)) {
                    throw new Error(
                        `message inlet ${inletId} : unexpected value ${value} of type <${typeof value}>`
                    )
                }
                value.forEach((message) =>
                    engine.inletCallers['fakeSourceNode'][inletId](message)
                )
            } else {
                if (typeof value !== 'number') {
                    throw new Error(
                        `signal inlet ${inletId} : unexpected value ${value} of type <${typeof value}>`
                    )
                }
                engine.inletCallers['fakeSourceNode'][inletId]([value])
            }
        })

        // Run the loop
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

export const assertNodeOutput = async <NodeArguments, NodeState>(
    nodeTestSettings: NodeTestSettings<NodeArguments, NodeState>,
    ...frames: Array<[FrameIn, FrameOut]>
): Promise<void> => {
    const expectedOutputFrames: Array<FrameOut> = frames.map(
        ([_, frameOut]) => frameOut
    )
    const inputFrames: Array<FrameIn> = frames.map(([frameIn]) => frameIn)
    let actualOutputFrames: Array<FrameOut> = await generateFramesForNode(
        nodeTestSettings,
        inputFrames
    )
    assert.deepStrictEqual(
        roundFloatsInFrames(actualOutputFrames),
        roundFloatsInFrames(expectedOutputFrames)
    )
}

const roundFloatsInFrames = (frames: Array<FrameOut>) =>
    frames.map((frame) => {
        const roundDecimal = 5
        const roundedFrame: FrameOut = { ...frame }
        Object.entries(frame.outs).forEach(([portletId, arrayOrSignal]) => {
            if (Array.isArray(arrayOrSignal)) {
                roundedFrame.outs[portletId] = arrayOrSignal.map((value) => {
                    if (typeof value === 'number') {
                        return round(value, roundDecimal) as any
                    }
                    return value
                })
            } else if (typeof arrayOrSignal === 'number') {
                roundedFrame.outs[portletId] = round(
                    arrayOrSignal,
                    roundDecimal
                )
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

const makeConnectionEndpointMap = (
    nodeId: DspGraph.NodeId,
    portletList: Array<DspGraph.PortletId>
) =>
    portletList.reduce<DspGraph.ConnectionEndpointMap>(
        (endpointMap, portletId) => ({
            ...endpointMap,
            [portletId]: [{ nodeId, portletId }],
        }),
        {}
    )

const makeMessagePortlets = (portletList: Array<DspGraph.PortletId>) =>
    portletList.reduce<DspGraph.PortletMap>(
        (portletMap, portletId) => ({
            ...portletMap,
            [portletId]: { id: portletId, type: 'message' },
        }),
        {}
    )
