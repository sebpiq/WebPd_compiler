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

import { NODE_BUILDERS } from '@webpd/dsp-graph'
import compile from '../compile'
import NODE_IMPLEMENTATIONS from '.'
import {
    CompilerSettings,
    EnginePorts,
    NodeImplementations,
    PortSpecs,
} from '../types'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from '../variable-names'
import { renderCode } from '../code-helpers'
import { JavaScriptEngine } from '../engine-javascript/types'
import { AssemblyScriptWasmEngine } from '../engine-assemblyscript/types'
import { bindPorts, setArray } from '../engine-assemblyscript/bindings'
import { compileAssemblyScript } from '../engine-assemblyscript/test-helpers'
import assert from 'assert'
import { round } from '../test-helpers'

interface NodeSummary {
    type: PdDspGraph.Node['type']
    args: PdDspGraph.Node['args']
    connectedSources?: Array<PdDspGraph.PortletId>
}

type GenericInletValue =
    | PdSharedTypes.SignalValue
    | Array<PdSharedTypes.ControlValue>

const setNodeInlet = (
    ports: EnginePorts,
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    ports[`write_${inletVariableName}`](value)
}

const setNodeOutlet = (
    ports: EnginePorts,
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const outletVariableName = generateOutletVariableName(nodeId, outletId)
    ports[`write_${outletVariableName}`](value)
}

const getNodeState = (
    ports: EnginePorts,
    nodeId: PdDspGraph.NodeId,
    name: string
) => {
    const variableName = generateStateVariableName(nodeId, name)
    return ports[`read_${variableName}`]()
}

export type Frame = {
    [portletId: string]:
        | Array<PdSharedTypes.ControlValue>
        | PdSharedTypes.SignalValue
}

export const generateFramesForNode = async (
    target: CompilerSettings['target'],
    nodeSummary: NodeSummary,
    inputFrames: Array<Frame>,
    arrays?: { [arrayName: string]: Array<number> }
): Promise<Array<Frame>> => {
    const _isConnectedToFakeNode = (inletId: PdDspGraph.PortletId) =>
        testNode.sources[inletId] &&
        testNode.sources[inletId].filter(
            (source) => source.nodeId === fakeSourceNode.id
        ).length

    // --------------- Generating test graph
    //   [fakeSourceNode] -> [testNode] -> [recorderNode]
    const { inlets: testNodeInlets, outlets: testNodeOutlets } = NODE_BUILDERS[
        nodeSummary.type
    ].build(nodeSummary.args)

    const fakeSourceNodeSinks: PdDspGraph.ConnectionEndpointMap = {}
    const testNodeSources: PdDspGraph.ConnectionEndpointMap = {}
    const testNodeSinks: PdDspGraph.ConnectionEndpointMap = {}
    const recorderNodeSources: PdDspGraph.ConnectionEndpointMap = {}

    Object.values(testNodeOutlets).forEach((outlet) => {
        testNodeSinks[outlet.id] = [
            { nodeId: 'recorderNode', portletId: outlet.id },
        ]
        recorderNodeSources[outlet.id] = [
            { nodeId: 'testNode', portletId: outlet.id },
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
    // to the node we want to test.
    // Ignored if no fake connections are declared
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

    // --------------- Generating implementation for testing recorder & engine
    const nodeImplementations: NodeImplementations = {
        ...NODE_IMPLEMENTATIONS,
        // This is a dummy node, it's only useful to fake connections
        'fake-source-node': {
            setup: () => ``,
            loop: () => ``,
        },
        'recorder-node': {
            // Generate one memory variable per outlet of test node
            setup: (_, { state, MACROS }) =>
                renderCode`${Object.values(recorderNode.inlets).map((inlet) =>
                    inlet.type === 'signal'
                        ? `let ${MACROS.typedVarFloat(
                              state['mem' + inlet.id]
                          )} = 0`
                        : `let ${MACROS.typedVarMessageArray(
                              state['mem' + inlet.id]
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

    // --------------- Compile ports, code, engine
    const portSpecs: PortSpecs = {}
    inputFrames.forEach((inputFrame) => {
        // Ports to write input values
        Object.keys(inputFrame).forEach((inletId) => {
            const inlet = testNode.inlets[inletId]
            const portType = inlet.type === 'signal' ? 'float' : 'messages'
            const inletVariableName = generateInletVariableName(
                testNode.id,
                inletId
            )
            portSpecs[inletVariableName] = { access: 'w', type: portType }

            // We need a port to write to the output of the fakeSourceNode only if it is connected
            if (_isConnectedToFakeNode(inletId)) {
                const outletVariableName = generateOutletVariableName(
                    fakeSourceNode.id,
                    inletId
                )
                portSpecs[outletVariableName] = { access: 'w', type: portType }
            }
        })

        // Ports to read output values
        Object.entries(recorderNode.inlets).forEach(([inletId, inlet]) => {
            const variableName = generateStateVariableName(
                recorderNode.id,
                'mem' + inletId
            )
            portSpecs[variableName] = {
                access: 'r',
                type: inlet.type === 'signal' ? 'float' : 'messages',
            }
        })
    })

    const code = compile(graph, nodeImplementations, {
        ...COMPILER_OPTIONS,
        target,
        portSpecs,
    })

    let engine: JavaScriptEngine | AssemblyScriptWasmEngine
    let ports: EnginePorts

    if (target === 'javascript') {
        const jsEngine = new Function(code)() as JavaScriptEngine
        ports = jsEngine.ports
        if (arrays) {
            Object.entries(arrays).forEach(([arrayName, data]) => {
                jsEngine.setArray(arrayName, data)
            })
        }
        engine = jsEngine
    } else {
        const ascEngine = ((await compileAssemblyScript(code)).instance
            .exports as unknown) as AssemblyScriptWasmEngine
        ports = bindPorts(ascEngine, portSpecs)
        if (arrays) {
            Object.entries(arrays).forEach(([arrayName, data]) => {
                setArray(ascEngine, arrayName, data)
            })
        }
        engine = ascEngine
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

    // blockSize = 1
    engine.configure(1)

    const outputFrames: Array<Frame> = []
    inputFrames.forEach((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) => {
            // TODO : if working set only inlet
            // We set the inlets with our simulation values.
            setNodeInlet(
                ports,
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
                    ports,
                    fakeSourceNode.id,
                    inletId,
                    Array.isArray(value) ? value.slice(0) : value
                )
            }
        })

        engine.loop()

        const outputFrame: Frame = {}
        Object.keys(recorderNode.inlets).forEach((inletId) => {
            outputFrame[inletId] = getNodeState(
                ports,
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
    nodeSummary: NodeSummary,
    inputFrames: Array<Frame>,
    expectedOutputFrames: Array<Frame>,
    arrays?: { [arrayName: string]: Array<number> }
): Promise<void> => {
    let actualOutputFrames: Array<Frame>
    actualOutputFrames = await generateFramesForNode(
        'javascript',
        nodeSummary,
        inputFrames,
        arrays
    )
    assert.deepStrictEqual(
        roundFloatsInFrames(actualOutputFrames),
        roundFloatsInFrames(expectedOutputFrames),
        'javascript frames not matching'
    )
    actualOutputFrames = await generateFramesForNode(
        'assemblyscript',
        nodeSummary,
        inputFrames,
        arrays
    )
    assert.deepStrictEqual(
        roundFloatsInFrames(actualOutputFrames),
        roundFloatsInFrames(expectedOutputFrames),
        'assemblyscript frames not matching'
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

export const COMPILER_OPTIONS = {
    sampleRate: 44100,
    channelCount: 2,
}
