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
} from './variable-names-index'
import {
    IoMessageSpecs,
    NodeImplementations,
    VariableNamesIndex,
} from './types'
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation } from '../test-helpers'

describe('variable-names-index', () => {
    describe('generate', () => {
        it('should create state variable names for each node', () => {
            const graph = makeGraph({
                node1: {},
                node2: {},
            })

            const variableNamesIndex = generateVariableNamesIndex(graph, false)

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    node1: {
                        signalOuts: {},
                        messageSenders: {},
                        messageReceivers: {},
                        state: 'node1_STATE',
                    },
                    node2: {
                        signalOuts: {},
                        messageReceivers: {},
                        messageSenders: {},
                        state: 'node2_STATE',
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const graph = makeGraph({
                node1: {},
            })

            const variableNamesIndex = generateVariableNamesIndex(graph, false)

            assert.throws(() => variableNamesIndex.nodes.unknownNode)
            assert.throws(
                () =>
                    variableNamesIndex.nodes.node1.messageReceivers[
                        'unknown receiver'
                    ]
            )
            assert.throws(
                () =>
                    variableNamesIndex.nodes.node1.signalOuts['unknown portlet']
            )
            assert.throws(
                () =>
                    variableNamesIndex.nodes.node1.messageSenders[
                        'unknown sender'
                    ]
            )
        })
    })

    describe('attachNodeVariable', () => {
        it('should attach portlet variable names for a node', () => {
            const graph = makeGraph({
                node1: {
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
                node2: {},
            })

            const variableNamesIndex = generateVariableNamesIndex(graph, false)

            const compilation = makeCompilation({
                variableNamesIndex,
                graph,
            })

            attachNodeVariable(compilation, 'signalOuts', 'node1', '0')
            attachNodeVariable(compilation, 'signalOuts', 'node1', '2')
            attachNodeVariable(compilation, 'messageSenders', 'node1', '1')
            attachNodeVariable(compilation, 'messageSenders', 'node1', '3')
            attachNodeVariable(compilation, 'messageReceivers', 'node1', '1')

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNamesIndex.nodes })),
                {
                    node1: {
                        signalOuts: {
                            '0': 'node1_OUTS_0',
                            '2': 'node1_OUTS_2',
                        },
                        messageSenders: {
                            '1': 'node1_SNDS_1',
                            '3': 'node1_SNDS_3',
                        },
                        messageReceivers: {
                            '1': 'node1_RCVS_1',
                        },
                        state: 'node1_STATE',
                    },
                    node2: {
                        signalOuts: {},
                        messageReceivers: {},
                        messageSenders: {},
                        state: 'node2_STATE',
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

            const variableNamesIndex = generateVariableNamesIndex(graph, true)

            const nodeImplementations: NodeImplementations = {
                'dac~bla*wow!': {},
            }

            const compilation = makeCompilation({
                graph,
                variableNamesIndex,
                nodeImplementations,
                settings: {
                    debug: true,
                },
            })

            attachNodeVariable(compilation, 'signalOuts', 'someObj', '0')
            attachNodeVariable(compilation, 'messageSenders', 'someObj', '1')
            attachNodeVariable(compilation, 'messageReceivers', 'someObj', '2')

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
                node1: {},
            })

            const compilation = makeCompilation({ graph })

            attachNodeVariable(compilation, 'messageReceivers', 'node1', '0')
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.messageReceivers.$0,
                'node1_RCVS_0'
            )
            assert.doesNotThrow(() =>
                attachNodeVariable(compilation, 'messageReceivers', 'node1', '0')
            )
            assert.strictEqual(
                compilation.variableNamesIndex.nodes.node1.messageReceivers.$0,
                'node1_RCVS_0'
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
                node1: {
                    inlets: {
                        inlet1: { type: 'message', id: 'inlet1' },
                    },
                    outlets: {
                        outlet1: { type: 'message', id: 'outlet1' },
                        outlet2: { type: 'message', id: 'outlet2' },
                    },
                },
            })

            const variableNamesIndex: VariableNamesIndex =
                generateVariableNamesIndex(graph, false)
            const messageSenders: IoMessageSpecs = {
                node1: { portletIds: ['outlet1'] },
            }
            const messageReceivers: IoMessageSpecs = {
                node1: { portletIds: ['inlet1'] },
            }

            const compilation = makeCompilation({
                graph,
                variableNamesIndex,
                settings: {
                    io: {
                        messageSenders,
                        messageReceivers,
                    },
                },
            })

            attachIoMessages(compilation)
            assert.deepStrictEqual(variableNamesIndex.io.messageSenders, {
                node1: {
                    outlet1: 'ioSnd_node1_outlet1',
                },
            })
            assert.deepStrictEqual(variableNamesIndex.io.messageReceivers, {
                node1: {
                    inlet1: 'ioRcv_node1_inlet1',
                },
            })
        })
    })
})