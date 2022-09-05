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
import compile, { assertValidNamePart, generateEngineVariableNames, generateInletVariableName, generateOutletVariableName, generatePortSpecs, generateStateVariableName, validateSettings } from './compile'
import { CompilerSettings, MessageListenerSpecs, NodeImplementations, PortSpecs } from './types'

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
                            '0': generateInletVariableName('myOsc', '0'),
                            '1': generateInletVariableName('myOsc', '1'),
                        },
                        outs: {
                            '0': generateOutletVariableName('myOsc', '0'),
                            '1': generateOutletVariableName('myOsc', '1'),
                        },
                        state: {
                            phase: generateStateVariableName('myOsc', 'phase'),
                            currentThing: generateStateVariableName(
                                'myOsc',
                                'currentThing'
                            ),
                            k: generateStateVariableName('myOsc', 'k'),
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
            assert.deepStrictEqual(settings.messageListenerSpecs, {})
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
        it('should generate portSpecs according to messageListenerSpecs', () => {
            const messageListenerSpecs: MessageListenerSpecs = {
                'bla': () => {},
                'blo': () => {},
            }
            const portSpecs: PortSpecs = generatePortSpecs(messageListenerSpecs)
            assert.deepStrictEqual(portSpecs, {
                'bla': {type: 'messages', access: 'r'},
                'blo': {type: 'messages', access: 'r'},
            })
        })
    })
})
