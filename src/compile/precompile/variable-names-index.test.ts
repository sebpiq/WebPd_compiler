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
import {
    assertValidNamePart,
    attachNodeVariable,
    attachIoMessages,
    generateVariableNamesIndex,
    attachNodeImplementationVariable,
} from './variable-names-index'
import {
    IoMessageSpecs,
    NodeImplementations,
} from '../types'
import { VariableNamesIndex } from './types'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { DspGraph } from '../../dsp-graph'
import { makeSettings } from '../test-helpers'

describe('variable-names-index', () => {
    describe('generate', () => {
        it('should create state variable names for each node', () => {
            const graph = makeGraph({
                n1: { type: 'type1' },
                n2: { type: 'type1' },
            })

            const nodeImplementations: NodeImplementations = { type1: {} }

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    n1: {
                        signalOuts: {},
                        messageSenders: {},
                        messageReceivers: {},
                        state: 'n1_STATE',
                    },
                    n2: {
                        signalOuts: {},
                        messageReceivers: {},
                        messageSenders: {},
                        state: 'n2_STATE',
                    },
                }
            )
        })

        it('should create namespace for each node node implementation encountered in the graph', () => {
            const graph = makeGraph({
                n1: { type: 'type1' },
                n2: { type: 'type2' },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {},
                type2: {},
            }

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            assert.deepStrictEqual(
                JSON.parse(
                    JSON.stringify({
                        ...variableNamesIndex.nodeImplementations,
                    })
                ),
                {
                    type1: {},
                    type2: {},
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const graph = makeGraph({
                n1: { type: 'type1' },
            })

            const nodeImplementations: NodeImplementations = { type1: {} }

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            assert.throws(() => variableNamesIndex.nodes.unknownNode)
            assert.throws(
                () =>
                    variableNamesIndex.nodes.n1!.messageReceivers[
                        'unknown receiver'
                    ]
            )
            assert.throws(
                () =>
                    variableNamesIndex.nodes.n1!.signalOuts['unknown portlet']
            )
            assert.throws(
                () =>
                    variableNamesIndex.nodes.n1!.messageSenders[
                        'unknown sender'
                    ]
            )
        })
    })

    describe('attachNodeVariable', () => {
        it('should attach portlet variable names for a node', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                        '2': { type: 'signal', id: '2' },
                        '3': { type: 'message', id: '3' },
                    },
                },
                n2: { type: 'type1' },
            })

            const nodeImplementations: NodeImplementations = { type1: {} }

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            attachNodeVariable(
                variableNamesIndex,
                settings,
                'signalOuts',
                graph.n1!,
                '0'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'signalOuts',
                graph.n1!,
                '2'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageSenders',
                graph.n1!,
                '1'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageSenders',
                graph.n1!,
                '3'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageReceivers',
                graph.n1!,
                '1'
            )

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    n1: {
                        signalOuts: {
                            '0': 'n1_OUTS_0',
                            '2': 'n1_OUTS_2',
                        },
                        messageSenders: {
                            '1': 'n1_SNDS_1',
                            '3': 'n1_SNDS_3',
                        },
                        messageReceivers: {
                            '1': 'n1_RCVS_1',
                        },
                        state: 'n1_STATE',
                    },
                    n2: {
                        signalOuts: {},
                        messageReceivers: {},
                        messageSenders: {},
                        state: 'n2_STATE',
                    },
                }
            )
        })

        it('should create more verbose variable names if debug is true', () => {
            const graph = makeGraph({
                someObj: {
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                    type: 'dac~bla*wow!',
                },
            })

            const nodeImplementations: NodeImplementations = {
                'dac~bla*wow!': {},
            }

            const settings = makeSettings({ debug: true })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            attachNodeVariable(
                variableNamesIndex,
                settings,
                'signalOuts',
                graph.someObj!,
                '0'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageSenders',
                graph.someObj!,
                '1'
            )
            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageReceivers',
                graph.someObj!,
                '2'
            )

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    someObj: {
                        signalOuts: {
                            '0': 'dacblawow_someObj_OUTS_0',
                        },
                        messageSenders: {
                            '1': 'dacblawow_someObj_SNDS_1',
                        },
                        messageReceivers: {
                            '2': 'dacblawow_someObj_RCVS_2',
                        },
                        state: 'dacblawow_someObj_STATE',
                    },
                }
            )
        })

        it('should not throw an error if variable already assigned', () => {
            const graph = makeGraph({
                n1: { type: 'type1' },
            })

            const nodeImplementations: NodeImplementations = { type1: {} }

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            attachNodeVariable(
                variableNamesIndex,
                settings,
                'messageReceivers',
                graph.n1!,
                '0'
            )
            assert.strictEqual(
                variableNamesIndex.nodes.n1!.messageReceivers.$0,
                'n1_RCVS_0'
            )
            assert.doesNotThrow(() =>
                attachNodeVariable(
                    variableNamesIndex,
                    settings,
                    'messageReceivers',
                    graph.n1!,
                    '0'
                )
            )
            assert.strictEqual(
                variableNamesIndex.nodes.n1!.messageReceivers.$0,
                'n1_RCVS_0'
            )
        })
    })

    describe('attachNodeImplementationVariable', () => {
        it('should attach state class variable names for NodeImplementation', () => {
            const nodeImplementations: NodeImplementations = {
                type1: {},
                'type2+-Bla': {
                    flags: {
                        alphaName: 'type2_Bla',
                    },
                },
            }

            const graph: DspGraph.Graph = makeGraph({
                n1: { type: 'type1' },
                n2: { type: 'type2+-Bla' },
            })

            const settings = makeSettings({ debug: false })

            const variableNamesIndex = generateVariableNamesIndex(
                settings,
                graph,
                nodeImplementations
            )

            attachNodeImplementationVariable(
                variableNamesIndex,
                'stateClass',
                'type1',
                nodeImplementations.type1!
            )
            attachNodeImplementationVariable(
                variableNamesIndex,
                'stateClass',
                'type2+-Bla',
                nodeImplementations['type2+-Bla']!
            )

            assert.deepStrictEqual(
                JSON.parse(
                    JSON.stringify({
                        ...variableNamesIndex.nodeImplementations,
                    })
                ),
                {
                    type1: { stateClass: 'State_type1' },
                    'type2+-Bla': { stateClass: 'State_type2_Bla' },
                }
            )
        })
    })

    describe('assertValidNamePart', () => {
        it('should throw an error if name part contains invalid characters', () => {
            assert.throws(() => assertValidNamePart('bla)-he'))
            assert.throws(() => assertValidNamePart('bla he'))
        })

        it('should not throw an error if name part is valid', () => {
            assert.deepStrictEqual(assertValidNamePart('bla_he0'), 'bla_he0')
        })
    })

    describe('attachIoMessages', () => {
        it('should attach outlet listeners variable names', () => {
            const graph = makeGraph({
                n1: {
                    type: 'type1',
                    inlets: {
                        inlet1: { type: 'message', id: 'inlet1' },
                    },
                    outlets: {
                        outlet1: { type: 'message', id: 'outlet1' },
                        outlet2: { type: 'message', id: 'outlet2' },
                    },
                },
            })

            const nodeImplementations: NodeImplementations = { type1: {} }

            const messageSenders: IoMessageSpecs = {
                n1: { portletIds: ['outlet1'] },
            }
            const messageReceivers: IoMessageSpecs = {
                n1: { portletIds: ['inlet1'] },
            }

            const settings = makeSettings({
                debug: false,
                io: {
                    messageSenders,
                    messageReceivers,
                },
            })

            const variableNamesIndex: VariableNamesIndex =
                generateVariableNamesIndex(settings, graph, nodeImplementations)

            attachIoMessages(variableNamesIndex, settings, graph)
            assert.deepStrictEqual(variableNamesIndex.io.messageSenders, {
                n1: {
                    outlet1: 'ioSnd_n1_outlet1',
                },
            })
            assert.deepStrictEqual(variableNamesIndex.io.messageReceivers, {
                n1: {
                    inlet1: 'ioRcv_n1_inlet1',
                },
            })
        })
    })
})
