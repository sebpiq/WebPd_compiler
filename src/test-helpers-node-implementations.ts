/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from 'assert'
import { executeCompilation, getMacros } from './compile'
import { createTestModule, makeCompilation, round } from './test-helpers'
import {
    Signal,
    Message,
    NodeImplementations,
    CompilerTarget,
    FloatArray,
    NodeImplementation,
    Engine,
    AudioSettings,
    SharedCodeGenerator,
    Code,
} from './types'
import { writeFile } from 'fs/promises'
import { mapArray, mapObject } from './functional-helpers'
import {
    AscTransferrableType,
    generateTestBindings as generateTestAscBindings,
} from './core-code/test-helpers-old'
import { getFloatArrayType } from './compile-helpers'
import { DspGraph } from './dsp-graph'
import { createEngine } from './engine-assemblyscript/AssemblyScriptWasmEngine'
import { instantiateJsCode } from './engine-javascript/test-helpers'
export { executeCompilation } from './compile'
export { makeCompilation } from './test-helpers'

// ================================ TESTING NODE IMPLEMENTATIONS ================================ //
interface NodeTestSettings<NodeArguments, NodeState> {
    target: CompilerTarget
    node: DspGraph.Node
    nodeImplementation: NodeImplementation<NodeArguments, NodeState>
    bitDepth: AudioSettings['bitDepth']
    arrays?: { [arrayName: string]: Array<number> }
}

type FrameNode = {
    fs?: {
        [FsFuncName in keyof Engine['fs']]?: Parameters<
            Engine['fs'][FsFuncName]
        >
    }
}
export type FrameNodeIn = FrameNode & {
    commons?: {
        getArray?: Array<string>
        setArray?: { [arrayName: string]: Array<number> }
    }
    ins?: { [portletId: string]: Array<Message> | Signal }
}
export type FrameNodeOut = FrameNode & {
    commons?: {
        getArray?: { [arrayName: string]: Array<number> }
    }
    outs: { [portletId: string]: Array<Message> | Signal }
    sequence?: Array<string>
}

export const generateFramesForNode = async <NodeArguments, NodeState>(
    nodeTestSettings: NodeTestSettings<NodeArguments, NodeState>,
    inputFrames: Array<FrameNodeIn>
): Promise<Array<FrameNodeOut>> => {
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
        sinks: mapArray(Array.from(connectedInlets), (portletId) => [
            portletId,
            [{ nodeId: 'testNode', portletId }],
        ]),
        inlets: mapArray(Object.keys(testNodeInlets), (portletId) => [
            portletId,
            { id: portletId, type: 'message' },
        ]),
        outlets: testNodeInlets,
        isPushingMessages: true,
    }

    // Node to test
    const testNode: DspGraph.Node = {
        ...nodeTestSettings.node,
        id: 'testNode',
        sources: mapArray(Array.from(connectedInlets), (portletId) => [
            portletId,
            [{ nodeId: 'fakeSourceNode', portletId }],
        ]),

        sinks: mapArray(Object.keys(testNodeOutlets), (portletId) => [
            portletId,
            [{ nodeId: 'fakeSinkNode', portletId }],
        ]),
        inlets: testNodeInlets,
        outlets: testNodeOutlets,
    }

    // Node to record output of testNode
    const fakeSinkNode: DspGraph.Node = {
        id: 'fakeSinkNode',
        type: 'fake_sink_node',
        args: {},
        sources: mapArray(Object.keys(testNodeOutlets), (portletId) => [
            portletId,
            [{ nodeId: 'testNode', portletId }],
        ]),
        sinks: {},
        inlets: testNodeOutlets,
        outlets: mapArray(Object.keys(testNodeOutlets), (portletId) => [
            portletId,
            { id: portletId, type: 'message' },
        ]),
        isPullingSignal: true,
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
                            // prettier-ignore
                            `let ${macros.Var(state[`VALUE_${outletId}`], 'Float')}`
                    )
                    .join('\n'),

            messages: ({ globs, snds, state }) =>
                mapObject(fakeSourceNode.outlets, (_, outletId) => {
                    // Messages received for message outlets are directly proxied
                    if (fakeSourceNode.outlets[outletId].type === 'message') {
                        return `${snds[outletId]}(${globs.m});return`

                        // Messages received for signal outlets are written to the loop
                    } else {
                        return `${
                            state[`VALUE_${outletId}`]
                        } = msg_readFloatToken(${globs.m}, 0);return`
                    }
                }),

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

            stateVariables: mapArray(
                Object.keys(fakeSourceNode.outlets).filter(
                    (outletId) =>
                        fakeSourceNode.outlets[outletId].type === 'signal'
                ),
                (outletId) => [`VALUE_${outletId}`, 1]
            ),
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
                mapArray(
                    Object.keys(fakeSinkNode.inlets).filter(
                        (inletId) =>
                            fakeSinkNode.inlets[inletId].type === 'message'
                    ),
                    (inletId) => [
                        inletId,
                        `${snds[inletId]}(${globs.m});return`,
                    ]
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
    const engine = await createTestModule<Engine>(
        target,
        bitDepth,
        code,
        {'assemblyscript': (buffer) => createEngine(buffer)}
    )

    if (arrays) {
        Object.entries(arrays).forEach(([arrayName, data]) => {
            engine.commons.setArray(arrayName, data)
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
    const outputFrames: Array<FrameNodeOut> = []
    const engineInput = buildEngineBlock(
        bitDepth,
        ENGINE_DSP_PARAMS.channelCount.in,
        blockSize
    )
    const engineOutput = buildEngineBlock(
        bitDepth,
        ENGINE_DSP_PARAMS.channelCount.out,
        blockSize
    )

    inputFrames.forEach((inputFrame) => {
        const outputFrame: FrameNodeOut = { outs: {}, sequence: [] }
        // Set default values for output frame
        Object.values(testNode.outlets).forEach((outlet) => {
            if (outlet.type === 'message') {
                outputFrame.outs[outlet.id] = []
            }
        })

        // Set up listeners for fs
        const _fsCallback = (
            funcName: keyof typeof outputFrame.fs,
            args: any
        ) => {
            outputFrame.fs = outputFrame.fs || {}
            outputFrame.sequence.push(funcName)
            outputFrame.fs[funcName] = args
        }
        engine.fs.onCloseSoundStream = (...args) =>
            _fsCallback('onCloseSoundStream', args)
        engine.fs.onOpenSoundReadStream = (...args) =>
            _fsCallback('onOpenSoundReadStream', args)
        engine.fs.onOpenSoundWriteStream = (...args) =>
            _fsCallback('onOpenSoundWriteStream', args)
        engine.fs.onReadSoundFile = (...args) =>
            _fsCallback('onReadSoundFile', args)
        engine.fs.onSoundStreamData = (...args) =>
            _fsCallback('onSoundStreamData', args)
        engine.fs.onWriteSoundFile = (...args) =>
            _fsCallback('onWriteSoundFile', args)

        // Set up outletListeners to receive sent messages
        Object.keys(engine.outletListeners['fakeSinkNode']).forEach(
            (outletId) => {
                engine.outletListeners['fakeSinkNode'][outletId] = {
                    onMessage: (m) => {
                        if (testNode.outlets[outletId].type === 'message') {
                            outputFrame.sequence.push(outletId)
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
                engine.fs[funcName as keyof FrameNodeIn['fs']].apply(null, args)
            })
        }

        // Get requested arrays
        if (inputFrame.commons) {
            if (inputFrame.commons.getArray) {
                outputFrame.commons = {}
                outputFrame.commons.getArray = {}
                inputFrame.commons.getArray.forEach((arrayName) => {
                    outputFrame.commons.getArray[arrayName] = Array.from(
                        engine.commons.getArray(arrayName)
                    )
                })
            }
            if (inputFrame.commons.setArray) {
                Object.entries(inputFrame.commons.setArray).forEach(
                    ([arrayName, array]) => {
                        engine.commons.setArray(arrayName, array)
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
    ...frames: Array<[FrameNodeIn, FrameNodeOut]>
): Promise<void> => {
    const inputFrames: Array<FrameNodeIn> = frames.map(([frameIn]) => frameIn)
    const expectedOutputFrames: Array<FrameNodeOut> = frames.map(
        ([_, frameOut]) => frameOut
    )
    let actualOutputFrames: Array<FrameNodeOut> = await generateFramesForNode(
        nodeTestSettings,
        inputFrames
    )

    frames.forEach(([_, expectedOutputFrame], i) => {
        const actualOutputFrame = actualOutputFrames[i]
        if (!expectedOutputFrame.sequence) {
            delete actualOutputFrame.sequence
        }
    })

    assert.deepStrictEqual(
        roundNestedFloats(actualOutputFrames),
        roundNestedFloats(expectedOutputFrames)
    )
}

// ================================ TESTING GLOBAL FUNCTIONS ================================ //
interface FrameSharedCode {
    parameters: Array<AscTransferrableType>
    returns: AscTransferrableType
}

interface SharedCodeTestSettings {
    target: CompilerTarget
    sharedCodeGenerators: Array<SharedCodeGenerator>
    functionName: string
    bitDepth: AudioSettings['bitDepth']
}

export const createTestBindings = async <
    ExportedFunctions extends { [functionName: string]: AscTransferrableType }
>(
    codeToTest: Code,
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    exportedFunctions: ExportedFunctions
) => {
    const compilation = makeCompilation({
        target,
        audioSettings: {
            channelCount: ENGINE_DSP_PARAMS.channelCount,
            bitDepth,
        },
    })

    let code = executeCompilation(compilation)

    if (target === 'javascript') {
        code +=
            codeToTest +
            `
            ${Object.keys(exportedFunctions).map(
                (functionName) => `exports.${functionName} = ${functionName}`
            )} 
        `
    } else {
        code +=
            codeToTest +
            `
            export {
                ${Object.keys(exportedFunctions).join(', ')}
            }
        `
    }

    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'asc'}`,
        code
    )

    if (target === 'assemblyscript') {
        return await generateTestAscBindings(code, bitDepth, exportedFunctions)
    } else {
        return (await instantiateJsCode(code)) as unknown as {
            [FuncName in keyof ExportedFunctions]: (
                ...args: Array<AscTransferrableType>
            ) => ExportedFunctions[FuncName]
        }
    }
}

/** Helper to test functions defined in {@link NodeImplementation#sharedCode}. */
export const assertSharedCodeFunctionOutput = async (
    sharedCodeTestSettings: SharedCodeTestSettings,
    ...frames: Array<FrameSharedCode>
) => {
    const { target, bitDepth, sharedCodeGenerators, functionName } =
        sharedCodeTestSettings

    const codeToTest = sharedCodeGenerators
        .map((sharedCodeGenerator) =>
            sharedCodeGenerator({
                macros: getMacros(target),
                target,
                audioSettings: {
                    bitDepth, channelCount: {in: 2, out: 2}
                }
            })
        )
        .join('\n')

    let bindings: any = await createTestBindings(codeToTest, target, bitDepth, {
        [functionName]: frames[0].returns,
    })

    const actualFrames: Array<FrameSharedCode> = []
    for (let frame of frames) {
        actualFrames.push({
            ...frame,
            returns: bindings[functionName](...frame.parameters),
        })
    }
    assert.deepStrictEqual(actualFrames, frames)
}

// ================================ UTILS ================================ //
// TODO : combine with `generateFramesForNode`
export const generateFrames = (
    engine: Engine,
    iterations: number = 4,
    engineInput?: FloatArray[]
) => {
    const blockSize = 1

    engineInput =
        engineInput ||
        buildEngineBlock(
            engine.metadata.audioSettings.bitDepth,
            engine.metadata.audioSettings.channelCount.in,
            blockSize
        )

    const engineOutput = buildEngineBlock(
        engine.metadata.audioSettings.bitDepth,
        engine.metadata.audioSettings.channelCount.out,
        blockSize
    )

    engine.configure(ENGINE_DSP_PARAMS.sampleRate, blockSize)

    const results: Array<Array<number>> = []
    for (let i = 0; i < iterations; i++) {
        engine.loop(engineInput, engineOutput)
        // Block size 1, so we flatten the array and get just the first sample
        results.push(engineOutput.map((channelValues) => channelValues[0]))
    }
    return results
}

/** Helper to round test results even nested in complex objects / arrays. */
export const roundNestedFloats = <T>(obj: T): T => {
    const roundDecimal = 4
    if (typeof obj === 'number') {
        return round(obj, roundDecimal) as unknown as T
    } else if (
        Array.isArray(obj) ||
        obj instanceof Float32Array ||
        obj instanceof Float64Array
    ) {
        return obj.map(roundNestedFloats) as unknown as T
    } else if (typeof obj === 'object') {
        Object.entries(obj).map(
            ([name, value]) => ((obj as any)[name] = roundNestedFloats(value))
        )
        return obj
    } else {
        return obj
    }
}

export const buildEngineBlock = (
    bitDepth: AudioSettings['bitDepth'],
    channelCount: number,
    blockSize: number
) => {
    const floatArrayType = getFloatArrayType(bitDepth)
    const engineOutput: Array<FloatArray> = []
    for (let channel = 0; channel < channelCount; channel++) {
        engineOutput.push(new floatArrayType(blockSize))
    }
    return engineOutput
}

export const ENGINE_DSP_PARAMS = {
    sampleRate: 44100,
    channelCount: { in: 2, out: 2 },
}
