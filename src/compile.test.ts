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
import compile, { assertValidNamePart, attachPortsAndMessageListenersVariableNames, generateEngineVariableNames, generatePortSpecs, validateSettings } from './compile'
import { CompilerSettings, EngineVariableNames, InletListeners, NodeImplementations, PortSpecs } from './types'

describe('compile', () => {
    const COMPILER_SETTINGS_AS: CompilerSettings = {
        audioSettings: {
            channelCount: 2,
            bitDepth: 32,
        },
        target: 'assemblyscript',
    }

    const COMPILER_SETTINGS_JS: CompilerSettings = {
        audioSettings: {
            channelCount: 2,
            bitDepth: 32,
        },
        target: 'javascript',
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'DUMMY': {
            loop: () => ''
        }
    }

    it('should compile assemblyscript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_AS)
        assert.strictEqual(typeof code, 'string')
    })

    it('should compile javascript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_JS)
        assert.strictEqual(typeof code, 'string')
    })

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
                graph,
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
                graph,
            )

            assert.throws(() => variableNames.n.unknownNode)
            assert.throws(
                () => variableNames.n.myOsc.ins['unknown portlet']
            )
            assert.throws(
                () => variableNames.n.myOsc.outs['unknown portlet']
            )
            assert.throws(
                () => variableNames.n.myOsc.state['unknown var']
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

    describe('validateSettings', () => {
        it('should validate settings and set defaults', () => {
            const settings = validateSettings({
                target: 'assemblyscript',
                audioSettings: {
                    channelCount: 2,
                    bitDepth: 32,
                }
            })
            assert.deepStrictEqual(settings.inletListeners, {})
        })

        it('should throw error if bitDepth invalid', () => {
            assert.throws(() =>
                validateSettings({
                    target: 'assemblyscript',
                    channelCount: 2,
                    sampleRate: 44100,
                    bitDepth: 666,
                } as any)
            )
        })
    })

    describe('generatePortSpecs', () => {
        it('should generate portSpecs according to inletListeners', () => {
            const engineVariableNames = generateEngineVariableNames(NODE_IMPLEMENTATIONS, makeGraph({
                'node1': {
                    inlets: {
                        'inlet1': {type: 'control', id: 'inlet1'},
                        'inlet2': {type: 'control', id: 'inlet2'},
                    },
                },
                'node2': {
                    inlets: {
                        'inlet1': {type: 'control', id: 'inlet1'},
                    },
                },
            }))
            const inletListeners: InletListeners = {
                'node1': ['inlet1', 'inlet2'],
                'node2': ['inlet1'],
            }
            const portSpecs: PortSpecs = generatePortSpecs(engineVariableNames, inletListeners)
            assert.deepStrictEqual(portSpecs, {
                'node1_INS_inlet1': {type: 'messages', access: 'r'},
                'node1_INS_inlet2': {type: 'messages', access: 'r'},
                'node2_INS_inlet1': {type: 'messages', access: 'r'},
            })
        })
    })

    describe('attachPortsAndMessageListenersVariableNames', () => {
        it('should attach variable names relating to ports and inlet listeners', () => {
            const engineVariableNames: EngineVariableNames = generateEngineVariableNames(NODE_IMPLEMENTATIONS, makeGraph({
                'node1': {
                    inlets: {
                        'inlet1': {type: 'control', id: 'inlet1'},
                        'inlet2': {type: 'control', id: 'inlet2'},
                    },
                },
            }))
            const portSpecs: PortSpecs = {
                'node1_INS_inlet1': { access: 'r', type: 'float'},
                'node1_INS_inlet2': { access: 'rw', type: 'float'},
            }
            const inletListeners: InletListeners = {
                'node1': ['inlet1'],
            }
            attachPortsAndMessageListenersVariableNames(engineVariableNames, portSpecs, inletListeners)

            assert.deepStrictEqual(engineVariableNames.ports, {
                'node1_INS_inlet1': {
                    'r': 'read_node1_INS_inlet1'
                },
                'node1_INS_inlet2': {
                    'r': 'read_node1_INS_inlet2',
                    'w': 'write_node1_INS_inlet2',
                },
            })
            assert.deepStrictEqual(engineVariableNames.inletListeners, {
                'node1': {'inlet1': 'inletListener_node1_inlet1'},
            })
        })
    })
})
