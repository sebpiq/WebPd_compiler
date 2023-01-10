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
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import {
    assertValidNamePart,
    attachInletCallers,
    attachOutletListeners,
    createNamespace,
    generate,
} from './code-variable-names'
import {
    CodeVariableNames,
    OutletListenerSpecs,
    NodeImplementations,
    InletCallerSpecs,
} from '../types'

describe('code-variable-names', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => '',
        },
    }

    describe('generate', () => {
        it('should create variable names for nodes', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    loop: () => `// [osc~] loop`,
                    stateVariables: () => ['phase', 'currentThing', 'k'],
                },
                'dac~': {
                    loop: () => `// [dac~] loop`,
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
                JSON.parse(JSON.stringify({ ...variableNames.n })),
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
                    loop: () => `// [dac~] loop`,
                    stateVariables: () => ['bli'],
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
                JSON.parse(JSON.stringify({ ...variableNames.n })),
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
                    loop: () => `// [osc~] loop`,
                    stateVariables: () => ['phase'],
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

            assert.throws(() => variableNames.n.unknownNode)
            assert.throws(() => variableNames.n.myOsc.ins['unknown portlet'])
            assert.throws(() => variableNames.n.myOsc.rcvs['unknown receiver'])
            assert.throws(() => variableNames.n.myOsc.outs['unknown portlet'])
            assert.throws(() => variableNames.n.myOsc.snds['unknown sender'])
            assert.throws(() => variableNames.n.myOsc.state['unknown var'])
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
            const outletListenerSpecs: OutletListenerSpecs = {
                node1: ['outlet1'],
            }
            const inletCallerSpecs: InletCallerSpecs = {
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
