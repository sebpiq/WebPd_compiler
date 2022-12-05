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
import { makeGraph } from '@webpd/shared/test-helpers'
import assert from 'assert'
import {
    assertValidNamePart,
    attachInletListenersVariableNames,
    createNamespace,
    generateEngineVariableNames,
} from './engine-variable-names'
import {
    EngineVariableNames,
    InletListenerSpecs,
    NodeImplementations,
} from './types'

describe('engine-variable-names', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => '',
        },
    }

    describe('generateEngineVariableNames', () => {
        it('should create variable names for nodes', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    loop: () => `// [osc~] loop`,
                    stateVariables: ['phase', 'currentThing', 'k'],
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
                        '1': { type: 'control', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'control', id: '1' },
                    },
                },
                myDac: {
                    type: 'dac~',
                },
            })

            const variableNames = generateEngineVariableNames(
                nodeImplementations,
                graph
            )

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...variableNames.n })),
                {
                    myOsc: {
                        ins: {
                            '0': 'myOsc_INS_0',
                            '1': 'myOsc_INS_1',
                        },
                        outs: {
                            '0': 'myOsc_OUTS_0',
                            '1': 'myOsc_OUTS_1',
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
                        state: {},
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    loop: () => `// [osc~] loop`,
                    stateVariables: ['phase'],
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

            const variableNames = generateEngineVariableNames(
                nodeImplementations,
                graph
            )

            assert.throws(() => variableNames.n.unknownNode)
            assert.throws(() => variableNames.n.myOsc.ins['unknown portlet'])
            assert.throws(() => variableNames.n.myOsc.outs['unknown portlet'])
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

    describe('attachInletListenersVariableNames', () => {
        it('should attach inlet listeners variable names', () => {
            const engineVariableNames: EngineVariableNames = generateEngineVariableNames(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'control', id: 'inlet1' },
                            inlet2: { type: 'control', id: 'inlet2' },
                        },
                    },
                })
            )
            const inletListeners: InletListenerSpecs = {
                node1: ['inlet1'],
            }
            attachInletListenersVariableNames(
                engineVariableNames,
                inletListeners
            )
            assert.deepStrictEqual(engineVariableNames.inletListeners, {
                node1: { inlet1: 'inletListener_node1_inlet1' },
            })
        })
    })

    describe('createNamespace', () => {
        it('should proxy access to exisinting keys', () => {
            const namespace = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.strictEqual(namespace.bla, '1')
            assert.strictEqual(namespace.hello, '2')
        })

        it('should create automatic $ alias for keys starting with a number', () => {
            const namespace: { [key: string]: string } = createNamespace({
                '0': 'blabla',
                '0_bla': 'bloblo',
            })
            assert.strictEqual(namespace.$0, 'blabla')
            assert.strictEqual(namespace.$0_bla, 'bloblo')
        })

        it('should throw error when trying to access unknown key', () => {
            const namespace: { [key: string]: string } = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.throws(() => namespace.blo)
        })

        it('should not prevent from using JSON stringify', () => {
            const namespace: { [key: string]: string } = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.deepStrictEqual(
                JSON.stringify(namespace),
                '{"bla":"1","hello":"2"}'
            )
        })
    })
})
