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
import { MessageListenerSpecs, NodeImplementations, PortSpecs } from './types'
import { Compilation, generateEngineVariableNames, generatePortSpecs, getNodeImplementation, validateSettings, wrapMacros } from './compilation'
import assert from 'assert'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'
import ASC_MACROS from './engine-assemblyscript/macros'
import JS_MACROS from './engine-javascript/macros'
import { makeCompilation } from './test-helpers'

describe('compilation', () => {

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

    describe('wrapMacros', () => {
        
        it('should bind assemblyscript macros to pass compilation as first argument', () => {
            const compilation: Compilation = makeCompilation({macros: ASC_MACROS})
            const wrappedMacros = wrapMacros(ASC_MACROS, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla: f32')
        })

        it('should bind javascript macros to pass compilation as first argument', () => {
            const compilation: Compilation = makeCompilation({macros: JS_MACROS})
            const wrappedMacros = wrapMacros(JS_MACROS, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla')
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

    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            'someNodeType': {loop: () => ``}
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType'), 
                NODE_IMPLEMENTATIONS['someNodeType']
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() => getNodeImplementation(NODE_IMPLEMENTATIONS, 'someUnknownNodeType'))
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
