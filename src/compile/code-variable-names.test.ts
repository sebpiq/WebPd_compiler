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
    attachInletCallers,
    attachNodeVariable,
    attachOutletListeners,
    generate,
} from './code-variable-names'
import { CodeVariableNames, NodeImplementations } from '../compile/types'
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation } from '../test-helpers'

describe('code-variable-names', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {},
    }

    describe('generate', () => {
        it('should create state variables for nodes', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    stateVariables: {
                        phase: 1,
                        currentThing: 1,
                        k: 1,
                    },
                },
                'dac~': {},
            }

            const graph = makeGraph({
                myOsc: {
                    type: 'osc~',
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
                myDac: {
                    type: 'dac~',
                },
            })

            const variableNames = generate(nodeImplementations, graph, false)

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNames.nodes })),
                {
                    myOsc: {
                        outs: {},
                        snds: {},
                        rcvs: {},
                        state: {
                            phase: 'myOsc_STATE_phase',
                            currentThing: 'myOsc_STATE_currentThing',
                            k: 'myOsc_STATE_k',
                        },
                    },
                    myDac: {
                        outs: {},
                        rcvs: {},
                        snds: {},
                        state: {},
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    stateVariables: { phase: 1 },
                },
            }

            const graph = makeGraph({
                myOsc: {
                    type: 'osc~',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const variableNames = generate(nodeImplementations, graph, false)

            assert.throws(() => variableNames.nodes.unknownNode)
            assert.throws(
                () => variableNames.nodes.myOsc.rcvs['unknown receiver']
            )
            assert.throws(
                () => variableNames.nodes.myOsc.outs['unknown portlet']
            )
            assert.throws(
                () => variableNames.nodes.myOsc.snds['unknown sender']
            )
            assert.throws(() => variableNames.nodes.myOsc.state['unknown var'])
        })
    })

    describe('attachNodeVariable', () => {
        it('should attach variable names for a node', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {},
                'dac~': {},
            }

            const graph = makeGraph({
                myOsc: {
                    type: 'osc~',
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
                myDac: {
                    type: 'dac~',
                },
            })

            const variableNames = generate(nodeImplementations, graph, false)

            const compilation = makeCompilation({
                nodeImplementations,
                codeVariableNames: variableNames,
                graph,
            })

            attachNodeVariable(compilation, 'outs', 'myOsc', '0')
            attachNodeVariable(compilation, 'outs', 'myOsc', '2')
            attachNodeVariable(compilation, 'snds', 'myOsc', '1')
            attachNodeVariable(compilation, 'snds', 'myOsc', '3')
            attachNodeVariable(compilation, 'rcvs', 'myOsc', '1')

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNames.nodes })),
                {
                    myOsc: {
                        outs: {
                            '0': 'myOsc_OUTS_0',
                            '2': 'myOsc_OUTS_2',
                        },
                        snds: {
                            '1': 'myOsc_SNDS_1',
                            '3': 'myOsc_SNDS_3',
                        },
                        rcvs: {
                            '1': 'myOsc_RCVS_1',
                        },
                        state: {},
                    },
                    myDac: {
                        outs: {},
                        rcvs: {},
                        snds: {},
                        state: {},
                    },
                }
            )
        })

        it('should create more verbose variable names if debug is true', () => {
            const nodeImplementations: NodeImplementations = {
                'dac~bla*wow!': {},
            }

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

            const variableNames = generate(nodeImplementations, graph, true)

            const compilation = makeCompilation({
                nodeImplementations,
                codeVariableNames: variableNames,
                debug: true,
                graph,
            })

            attachNodeVariable(compilation, 'outs', 'someObj', '0')
            attachNodeVariable(compilation, 'snds', 'someObj', '1')
            attachNodeVariable(compilation, 'rcvs', 'someObj', '2')

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNames.nodes })),
                {
                    someObj: {
                        outs: {
                            '0': 'dacblawow_someObj_OUTS_0',
                        },
                        snds: {
                            '1': 'dacblawow_someObj_SNDS_1',
                        },
                        rcvs: {
                            '2': 'dacblawow_someObj_RCVS_2',
                        },
                        state: {},
                    },
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

    describe('attachOutletListeners / attachInletCallers', () => {
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

            const codeVariableNames: CodeVariableNames = generate(
                NODE_IMPLEMENTATIONS,
                graph,
                false
            )
            const outletListenerSpecs = {
                node1: ['outlet1'],
            }
            const inletCallerSpecs = {
                node1: ['inlet1'],
            }

            const compilation = makeCompilation({
                graph,
                outletListenerSpecs,
                inletCallerSpecs,
                codeVariableNames,
            })

            attachOutletListeners(compilation)
            assert.deepStrictEqual(codeVariableNames.outletListeners, {
                node1: { outlet1: 'outletListener_node1_outlet1' },
            })

            attachInletCallers(compilation)
            assert.deepStrictEqual(codeVariableNames.inletCallers, {
                node1: { inlet1: 'inletCaller_node1_inlet1' },
            })
        })
    })
})
