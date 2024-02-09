import assert from 'assert'
import { Func, Var } from '../../ast/declare'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { makePrecompilation } from '../test-helpers'
import {
    precompileSignalOutlet,
    precompileSignalInletWithNoSource,
    precompileMessageOutlet,
    precompileMessageInlet,
} from './portlet'

describe('precompile.portlets', () => {
    describe('precompileSignalOutlet', () => {
        it('should substitute connected signal in with its source out for non-inline nodes', () => {
            const graph = makeGraph({
                n1: {
                    outlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileSignalOutlet(precompilation, graph.n1!, '0')
            precompileSignalOutlet(precompilation, graph.n2!, '0')

            // Creates a variable name for the signal out
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1!.signalOuts
                    .$0,
                'n1_OUTS_0'
            )
            // Adds this variable name to precompilation `signalOuts`
            assert.strictEqual(
                precompilation.output.nodes.n1!.signalOuts.$0,
                'n1_OUTS_0'
            )

            // Assigns n1's out to n2's signalIn
            assert.strictEqual(
                precompilation.output.nodes.n2!.signalIns.$0,
                'n1_OUTS_0'
            )
        })
    })

    describe('precompileSignalInletWithNoSource', () => {
        it('should put empty signal for unconnected inlet', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileSignalInletWithNoSource(precompilation, graph.n1!, '0')

            // Substitute with empty signal in signalIns
            assert.strictEqual(
                precompilation.output.nodes.n1!.signalIns.$0,
                precompilation.output.variableNamesIndex.globs.nullSignal
            )
        })
    })

    describe('precompileMessageOutlet', () => {
        it('should create messageSender if several sinks or io.messageSender', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.variableNamesIndex.nodes.n2!.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.variableNamesIndex.nodes.n3!.messageReceivers.$0 =
                'n3_RCVS_0'

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1!
                    .messageSenders.$0,
                'n1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1!.messageSenders.$0,
                {
                    messageSenderName: 'n1_SNDS_0',
                    sinkFunctionNames: ['n2_RCVS_0', 'n3_RCVS_0'],
                }
            )
        })

        it('should create messageSender and add cold dsp function', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: { '0': [['n2', '0']] },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.graph.coldDspGroups = {
                '0': {
                    traversal: ['n2'],
                    outNodesIds: ['n2'],
                    sinkConnections: [],
                },
            }

            precompilation.output.variableNamesIndex.nodes.n2!.messageReceivers.$0 =
                'n2_RCVS_0'
            precompilation.output.variableNamesIndex.coldDspGroups['0'] =
                'DSP_0'

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Creates a variable name for the message sender
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n1!
                    .messageSenders.$0,
                'n1_SNDS_0'
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1!.messageSenders.$0,
                {
                    messageSenderName: 'n1_SNDS_0',
                    sinkFunctionNames: ['n2_RCVS_0', 'DSP_0'],
                }
            )
        })

        it('should substitute message sender with null function if no sink and not outlet listener', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.graph.fullTraversal = ['n1']
            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1!.messageSenders.$0,
                {
                    messageSenderName:
                        precompilation.output.variableNamesIndex.globs
                            .nullMessageReceiver,
                    sinkFunctionNames: [],
                }
            )
        })

        it("should substitute message sender with the sink's receiver if only one sink", () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompilation.output.variableNamesIndex.nodes.n2!.messageReceivers.$0 =
                'n2_RCVS_0'

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.output.nodes.n1!.messageSenders.$0,
                {
                    messageSenderName: 'n2_RCVS_0',
                    sinkFunctionNames: [],
                }
            )
        })
    })

    describe('precompileMessageInlet', () => {
        it('should declare message inlet when it has one or more sources', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                        '1': { id: '1', type: 'message' },
                    },
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                        '1': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                n3: {
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({ graph })

            precompileMessageInlet(precompilation, graph.n2!, '0')
            precompileMessageInlet(precompilation, graph.n3!, '0')

            // Creates a variable names for message receivers
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n2!
                    .messageReceivers.$0,
                'n2_RCVS_0'
            )
            assert.strictEqual(
                precompilation.output.variableNamesIndex.nodes.n3!
                    .messageReceivers.$0,
                'n3_RCVS_0'
            )

            // Add placeholder messageReceivers
            assert.deepStrictEqual(
                precompilation.output.nodes.n2!.messageReceivers.$0,
                Func(
                    'n2_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
            assert.deepStrictEqual(
                precompilation.output.nodes.n3!.messageReceivers.$0,
                Func(
                    'n3_RCVS_0',
                    [Var('Message', 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
        })

        it('should declare no message receivers when inlet has no source', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({
                graph,
            })

            precompileMessageInlet(precompilation, graph.n1!, '0')

            assert.ok(
                !(
                    '0' in
                    precompilation.output.variableNamesIndex.nodes.n1!
                        .messageReceivers
                )
            )
            assert.ok(
                !('0' in precompilation.output.nodes.n1!.messageReceivers)
            )
        })
    })
})
