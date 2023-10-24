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
import { NodeImplementations } from './types'
import { makeCompilation } from '../test-helpers'
import { normalizeCode } from '../test-helpers'
import generateDeclarationsGraph from './generate-declarations-graph'
import { makeGraph } from '../dsp-graph/test-helpers'

describe('generateDeclarationsGraph', () => {
    it('should compile declarations for signal inlets, outlets and node custom declarations', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
                inlets: {
                    '0_signal': { id: '0_signal', type: 'signal' },
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            dac: {
                type: 'dac~',
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
                outlets: {},
            },
        })

        const nodeImplementations: NodeImplementations = {
            'osc~': {
                generateDeclarations: ({ node }) =>
                    `// [osc~] frequency ${node.args.frequency}`,
                generateLoop: () => ``,
            },
            'dac~': {
                generateDeclarations: ({ compilation: { audioSettings } }) =>
                    `// [dac~] channelCount ${audioSettings.channelCount.out}`,
                generateLoop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['osc', 'dac'],
            nodeImplementations,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                let osc_INS_0_signal = 0
                let osc_OUTS_0 = 0
                // [osc~] frequency 440

                let dac_INS_0 = 0
                let dac_INS_1 = 0
                // [dac~] channelCount 2                
            `)
        )
    })

    it('should compile node message receivers for message inlets', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {
                generateMessageReceivers: () => ({
                    '0': '// [+] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['add'],
            nodeImplementations,
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                function add_RCVS_0 (m) {
                    // [+] message receiver
                    throw new Error('[+], id "add", inlet "0", unsupported message : ' + msg_display(m))
                }
            `)
        )
    })

    it('should omit message receivers for removed inlets', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {
                generateMessageReceivers: () => ({
                    '0': '// [+] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['add'],
            nodeImplementations,
            precompiledPortlets: {
                // Since no connection we declare that this should not be included in compilation
                precompiledInlets: { add: ['0'] },
                precompiledOutlets: {},
            },
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(normalizeCode(declareCode), '')
    })

    it('should render correct error throw if debug = true', () => {
        const graph = makeGraph({
            someNode: {
                type: 'add',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            add: {
                generateMessageReceivers: () => ({
                    '0': '// [add] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['someNode'],
            debug: true,
            nodeImplementations,
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`   
                function add_someNode_RCVS_0 (m) {
                    // [add] message receiver
                    throw new Error('[add], id "someNode", inlet "0", unsupported message : ' + msg_display(m) + '\\nDEBUG : remember, you must return from message receiver')
                }
            `)
        )
    })

    it('should throw an error if no implementation for message receiver', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {
                generateMessageReceivers: () => ({}),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['add'],
            nodeImplementations,
        })

        assert.throws(() => generateDeclarationsGraph(compilation))
    })

    it('should not throw an error if message receiver is implemented but string empty', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {
                generateMessageReceivers: () => ({ '0': '' }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['add'],
            nodeImplementations,
        })

        assert.doesNotThrow(() => generateDeclarationsGraph(compilation))
    })

    it('should compile node message senders for message outlets', () => {
        const graph = makeGraph({
            // Sending messages to several sinks,
            twenty: {
                type: 'twenty',
                outlets: {
                    '0': { id: '0', type: 'message' },
                },
                sinks: {
                    '0': [
                        ['aFloat', '0'],
                        ['anotherFloat', '0'],
                    ],
                },
            },
            // Sending messages to a single sink,
            aFloat: {
                type: 'float',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
                outlets: {
                    '0': { id: '0', type: 'message' },
                },
                sinks: { '0': [['anotherFloat', '0']] },
            },
            anotherFloat: {
                type: 'float',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            twenty: {},
            float: {
                generateMessageReceivers: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['twenty', 'aFloat', 'anotherFloat'],
            nodeImplementations,
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                function aFloat_RCVS_0 (m) {
                    // [float] message receiver
                    throw new Error('[float], id "aFloat", inlet "0", unsupported message : ' + msg_display(m))
                }

                function anotherFloat_RCVS_0 (m) {
                    // [float] message receiver
                    throw new Error('[float], id "anotherFloat", inlet "0", unsupported message : ' + msg_display(m))
                }

                function twenty_SNDS_0 (m) {
                    aFloat_RCVS_0(m)
                    anotherFloat_RCVS_0(m)
                }

                function aFloat_SNDS_0 (m) { 
                    anotherFloat_RCVS_0(m)
                }
            `)
        )
    })

    it('should omit node message senders for removed message outlets', () => {
        const graph = makeGraph({
            someNode: {
                type: 'someNodeType',
                outlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            someNodeType: {
                generateMessageReceivers: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['someNode'],
            nodeImplementations,
            precompiledPortlets: {
                precompiledInlets: {},
                // Since no connection we declare that this should not be included in compilation
                precompiledOutlets: { someNode: ['0'] },
            },
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(normalizeCode(declareCode), '')
    })

    it('should inject outlet listener in node message senders', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                outlets: {
                    '0': { id: '0', type: 'message' },
                    '1': { id: '1', type: 'signal' },
                    '2': { id: '2', type: 'message' },
                },
                sinks: { '2': [['aFloat', '0']] },
            },
            aFloat: {
                type: 'float',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {},
            float: {
                generateMessageReceivers: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['add', 'aFloat'],
            nodeImplementations,
            outletListenerSpecs: { add: ['0', '2'] },
        })

        const declareCode = generateDeclarationsGraph(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                let add_OUTS_1 = 0

                function aFloat_RCVS_0 (m) {
                    // [float] message receiver
                    throw new Error('[float], id "aFloat", inlet "0", unsupported message : ' + msg_display(m))
                }

                function add_SNDS_0 (m) {
                    outletListener_add_0(m)
                }
                function add_SNDS_2 (m) {
                    outletListener_add_2(m)
                    aFloat_RCVS_0(m)
                }
            `)
        )
    })

    it('should not fail when node implementation has no "generateDeclarations" hook', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                inlets: {
                    '0_message': { id: '0_message', type: 'message' },
                    '0_signal': { id: '0_signal', type: 'signal' },
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            dac: {
                type: 'dac~',
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            'osc~': {
                generateDeclarations: () => ``,
                generateLoop: () => ``,
                generateMessageReceivers: () => ({
                    '0_message': '// [osc~] message receiver',
                }),
            },
            'dac~': {
                generateLoop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversalDeclare: ['osc', 'dac'],
            nodeImplementations,
        })

        assert.doesNotThrow(() => generateDeclarationsGraph(compilation))
    })
})
