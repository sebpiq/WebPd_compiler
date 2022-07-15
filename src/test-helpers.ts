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
import compile from './compile'
import NODE_IMPLEMENTATIONS from './nodes'
import { Code, CompilerSettings, NodeImplementations } from './types'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'
import { renderCode } from './code-helpers'
import asc from 'assemblyscript/asc'
import { JavaScriptEngine } from './engine-javascript/types'

interface NodeSummary {
    type: PdDspGraph.Node['type']
    args: PdDspGraph.Node['args']
    connectedSources?: Array<PdDspGraph.PortletId>
}

type GenericInletValue =
    | PdSharedTypes.SignalValue
    | Array<PdSharedTypes.ControlValue>

export const round = (v: number, decimals: number = 3) => 
    Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)

export const compileAssemblyScript = async (code: Code) => {
    const { error, binary, stderr } = await asc.compileString(code, {
        optimizeLevel: 3,
        runtime: "stub",
        exportRuntime: true,
    })
    if (error) {
        throw new Error(stderr.toString())
    }

    const wasmModule = await WebAssembly.instantiate(binary.buffer, {
        env: {
            // memory,
            abort: function() {},
            seed() {
                // ~lib/builtins/seed() => f64
                return (() => {
                  // @external.js
                  return Date.now() * Math.random()
                })()
            },
            // log: function(a) { console.log(a) }
            // "console.log"(pointer: number) {
            //     // ~lib/bindings/dom/console.log(~lib/string/String) => void
            //     const text = liftString(wasmModule.instance.exports as any, pointer);
            //     console.log(text);
            // },
        },
    })
    return wasmModule
}

const setNodeInlet = (
    engine: JavaScriptEngine,
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const inletVariableName = generateInletVariableName(nodeId, inletId)
    engine.ports[`write_${inletVariableName}`](value)
}

const setNodeOutlet = (
    engine: JavaScriptEngine,
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId,
    value: GenericInletValue
) => {
    const outletVariableName = generateOutletVariableName(nodeId, outletId)
    engine.ports[`write_${outletVariableName}`](value)
}

const getNodeState = (
    engine: JavaScriptEngine,
    nodeId: PdDspGraph.NodeId,
    name: string
) => {
    const variableName = generateStateVariableName(nodeId, name)
    return engine.ports[`read_${variableName}`]()
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
                renderCode`${Object.values(recorderNode.inlets).map(
                    (inlet) => inlet.type === "signal" ? 
                        MACROS.declareFloat(state['mem' + inlet.id], 0): 
                        MACROS.declareMessageArray(state['mem' + inlet.id])
                )}`,
            // For each outlet of test node, save the output value in corresponding memory.
            // This is necessary cause engine clears outlets at each run of loop.
            loop: (_, { state, ins }) =>
                renderCode`${Object.values(recorderNode.inlets).map(
                    (inlet) => inlet.type === "signal" ? 
                        `${state['mem' + inlet.id]} = ${ins[inlet.id]}`:
                        `${state['mem' + inlet.id]} = ${ins[inlet.id]}.slice(0)`
                )}`,
            stateVariables: Object.keys(recorderNode.inlets).map(
                (inletId) => 'mem' + inletId
            ),
        },
    }

    // Create ports to access variables 
    const ports: CompilerSettings["ports"] = {}
    inputFrames.map((inputFrame) => {
        Object.keys(inputFrame).forEach(inletId => {
            const inlet = testNode.inlets[inletId]
            const portType = inlet.type === 'signal' ? 'float': 'messages'
            const inletVariableName = generateInletVariableName(testNode.id, inletId)
            ports[inletVariableName] = {access: 'w', type: portType}
            const outletVariableName = generateOutletVariableName(fakeSourceNode.id, inletId)
            ports[outletVariableName] = {access: 'w', type: portType}
        })
        Object.entries(recorderNode.inlets).forEach(([inletId, inlet]) => {
            const variableName = generateStateVariableName(recorderNode.id, 'mem' + inletId)
            ports[variableName] = {access: 'r', type: inlet.type === 'signal' ? 'float': 'messages'}
        })
    })

    const code = compile(graph, nodeImplementations, {
        ...COMPILER_SETTINGS,
        ports
    })
    const engine = new Function(code)()

    // blockSize = 1
    engine.configure(1)

    // --------------- Generate frames
    const outputFrames: Array<Frame> = []
    inputFrames.map((inputFrame) => {
        Object.entries(inputFrame).forEach(([inletId, value]) => {
            // We set the inlets with our simulation values.
            setNodeInlet(engine, testNode.id, inletId, value)

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
        })

        engine.loop()

        const outputFrame: Frame = {}
        Object.keys(recorderNode.inlets).forEach((inletId) => {
            outputFrame[inletId] = getNodeState(
                engine,
                recorderNode.id,
                'mem' + inletId
            )
        })
        outputFrames.push(outputFrame)
    })

    return outputFrames
}

export const COMPILER_SETTINGS: CompilerSettings = {
    sampleRate: 44100,
    channelCount: 2,
    arraysVariableName: 'WEBPD_ARRAYS',
    target: 'javascript'
}
