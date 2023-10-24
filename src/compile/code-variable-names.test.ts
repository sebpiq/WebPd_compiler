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
    attachOutletListeners,
    createNamespace,
    generate,
} from './code-variable-names'
import { CodeVariableNames, NodeImplementations } from '../compile/types'
import { makeGraph } from '../dsp-graph/test-helpers'

describe('code-variable-names', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            generateLoop: () => '',
        },
    }

    describe('generate', () => {
        it('should create variable names for nodes', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    generateLoop: () => `// [osc~] loop`,
                    stateVariables: {
                        phase: 1,
                        currentThing: 1,
                        k: 1,
                    },
                },
                'dac~': {
                    generateLoop: () => `// [dac~] loop`,
                },
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
                        ins: {
                            '0': 'myOsc_INS_0',
                        },
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
                        state: {
                            phase: 'myOsc_STATE_phase',
                            currentThing: 'myOsc_STATE_currentThing',
                            k: 'myOsc_STATE_k',
                        },
                    },
                    myDac: {
                        ins: {},
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
                'dac~bla*wow!': {
                    generateLoop: () => `// [dac~] loop`,
                    stateVariables: { bli: 1 },
                },
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

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNames.nodes })),
                {
                    someObj: {
                        ins: {
                            '0': 'dacblawow_someObj_INS_0',
                        },
                        outs: {
                            '0': 'dacblawow_someObj_OUTS_0',
                        },
                        snds: {
                            '1': 'dacblawow_someObj_SNDS_1',
                        },
                        rcvs: {},
                        state: {
                            bli: 'dacblawow_someObj_STATE_bli',
                        },
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    generateLoop: () => `// [osc~] loop`,
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
                () => variableNames.nodes.myOsc.ins['unknown portlet']
            )
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
            const codeVariableNames: CodeVariableNames = generate(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'message', id: 'inlet1' },
                        },
                        outlets: {
                            outlet1: { type: 'message', id: 'outlet1' },
                            outlet2: { type: 'message', id: 'outlet2' },
                        },
                    },
                }),
                false
            )
            const outletListenerSpecs = {
                node1: ['outlet1'],
            }
            const inletCallerSpecs = {
                node1: ['inlet1'],
            }

            attachOutletListeners(codeVariableNames, outletListenerSpecs)
            assert.deepStrictEqual(codeVariableNames.outletListeners, {
                node1: { outlet1: 'outletListener_node1_outlet1' },
            })

            attachInletCallers(codeVariableNames, inletCallerSpecs)
            assert.deepStrictEqual(codeVariableNames.inletCallers, {
                node1: { inlet1: 'inletCaller_node1_inlet1' },
            })
        })
    })

    describe('createNamespace', () => {
        it('should proxy access to exisinting keys', () => {
            const namespace = createNamespace('dummy', {
                bla: '1',
                hello: '2',
            })
            assert.strictEqual(namespace.bla, '1')
            assert.strictEqual(namespace.hello, '2')
        })

        it('should create automatic $ alias for keys starting with a number', () => {
            const namespace: { [key: string]: string } = createNamespace(
                'dummy',
                {
                    '0': 'blabla',
                    '0_bla': 'bloblo',
                }
            )
            assert.strictEqual(namespace.$0, 'blabla')
            assert.strictEqual(namespace.$0_bla, 'bloblo')
        })

        it('should throw error when trying to access unknown key', () => {
            const namespace: { [key: string]: string } = createNamespace(
                'dummy',
                {
                    bla: '1',
                    hello: '2',
                }
            )
            assert.throws(() => namespace.blo)
        })

        it('should not prevent from using JSON stringify', () => {
            const namespace: { [key: string]: string } = createNamespace(
                'dummy',
                {
                    bla: '1',
                    hello: '2',
                }
            )
            assert.deepStrictEqual(
                JSON.stringify(namespace),
                '{"bla":"1","hello":"2"}'
            )
        })
    })
})
