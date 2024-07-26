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
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n1!.signalOuts,
                { '0': 'N_n1_outs_0' }
            )

            // Adds this variable name to precompilation `signalOuts`
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.signalOuts['0'],
                'N_n1_outs_0'
            )

            // Assigns n1's out to n2's signalIn
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n2!.signalIns['0'],
                'N_n1_outs_0'
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
                precompilation.precompiledCode.nodes.n1!.signalIns['0'],
                precompilation.variableNamesIndex.globs.nullSignal
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

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Creates a variable name for the message sender
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n1!.messageSenders,
                { '0': 'N_n1_snds_0' }
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.messageSenders['0'],
                {
                    messageSenderName: 'N_n1_snds_0',
                    sinkFunctionNames: ['N_n2_rcvs_0', 'N_n3_rcvs_0'],
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

            precompilation.precompiledCode.graph.coldDspGroups = {
                '0': {
                    dspGroup: {
                        traversal: ['n2'],
                        outNodesIds: ['n2'],
                    },
                    sinkConnections: [],
                    functionName: 'COLD_0',
                },
            }

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Creates a variable name for the message sender
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n1!.messageSenders,
                { '0': 'N_n1_snds_0' }
            )
            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.messageSenders['0'],
                {
                    messageSenderName: 'N_n1_snds_0',
                    sinkFunctionNames: ['N_n2_rcvs_0', 'COLD_0'],
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

            precompilation.precompiledCode.graph.fullTraversal = ['n1']
            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.messageSenders['0'],
                {
                    messageSenderName:
                        precompilation.variableNamesIndex.globs
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

            precompileMessageOutlet(precompilation, graph.n1!, '0')

            // Add precompilation info for the message sender
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n1!.messageSenders['0'],
                {
                    messageSenderName: 'N_n2_rcvs_0',
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
            const globalCode = precompilation.variableNamesAssigner.globalCode

            precompileMessageInlet(precompilation, graph.n2!, '0')
            precompileMessageInlet(precompilation, graph.n3!, '0')

            // Creates a variable names for message receivers
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n2!.messageReceivers,
                { '0': 'N_n2_rcvs_0' }
            )
            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodes.n3!.messageReceivers,
                { '0': 'N_n3_rcvs_0' }
            )

            // Add placeholder messageReceivers
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n2!.messageReceivers['0'],
                Func(
                    'N_n2_rcvs_0',
                    [Var(globalCode.msg!.Message!, 'm')],
                    'void'
                )`throw new Error("This placeholder should have been replaced during precompilation")`
            )
            assert.deepStrictEqual(
                precompilation.precompiledCode.nodes.n3!.messageReceivers['0'],
                Func(
                    'N_n3_rcvs_0',
                    [Var(globalCode.msg!.Message!, 'm')],
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

            assert.ok(!('n1' in precompilation.variableNamesIndex.nodes))
            assert.ok(
                !('0' in precompilation.precompiledCode.nodes.n1!.messageReceivers)
            )
        })
    })
})
