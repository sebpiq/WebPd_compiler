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

import assert from 'assert'
import { NodeImplementations } from '../types'
import { makeCompilation, normalizeCode } from '../test-helpers'
import compileDeclare from './compile-declare'
import { makeGraph } from '../dsp-graph/test-helpers'

describe('compileDeclare', () => {
    const GLOBAL_VARIABLES_CODE = `
        let F = 0
        let FRAME = 0
        let BLOCK_SIZE = 0
        let SAMPLE_RATE = 0
        function SND_TO_NULL (m) {}
    `

    it('should compile declaration for global variables', () => {
        const graph = makeGraph({})

        const nodeImplementations: NodeImplementations = {}

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(GLOBAL_VARIABLES_CODE)
        )
    })

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
                declare: ({ node }) =>
                    `// [osc~] frequency ${node.args.frequency}`,
                loop: () => ``,
            },
            'dac~': {
                declare: ({ compilation: { audioSettings } }) =>
                    `// [dac~] channelCount ${audioSettings.channelCount.out}`,
                loop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['osc', 'dac'],
            nodeImplementations,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                
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
                messages: () => ({
                    '0': '// [+] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['add'],
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                
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
                messages: () => ({
                    '0': '// [+] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['add'],
            nodeImplementations,
            precompiledPortlets: {
                // Since no connection we declare that this should not be included in compilation
                precompiledInlets: { add: ['0'] },
                precompiledOutlets: {},
            },
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(GLOBAL_VARIABLES_CODE)
        )
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
                messages: () => ({
                    '0': '// [add] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['someNode'],
            debug: true,
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                
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
                messages: () => ({}),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['add'],
            nodeImplementations,
        })

        assert.throws(() => compileDeclare(compilation))
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
                messages: () => ({ '0': '' }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['add'],
            nodeImplementations,
        })

        assert.doesNotThrow(() => compileDeclare(compilation))
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
                messages: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['twenty', 'aFloat', 'anotherFloat'],
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}

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
                messages: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['someNode'],
            nodeImplementations,
            precompiledPortlets: {
                precompiledInlets: {},
                // Since no connection we declare that this should not be included in compilation
                precompiledOutlets: { someNode: ['0'] },
            },
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(GLOBAL_VARIABLES_CODE)
        )
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
                messages: () => ({
                    '0': '// [float] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['add', 'aFloat'],
            nodeImplementations,
            outletListenerSpecs: { add: ['0', '2'] },
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}

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

    it('should inject shared code from nodes avoiding duplicates', () => {
        const graph = makeGraph({
            node1: {
                type: 'nodeType1',
            },
            node2: {
                type: 'nodeType1',
            },
            node3: {
                type: 'nodeType2',
            },
        })

        const nodeImplementations: NodeImplementations = {
            nodeType1: {
                sharedCode: [() => `// blockSize`],
            },
            nodeType2: {
                sharedCode: [
                    // Put same shared code as nodeType1
                    () => `// blockSize`,
                    () => `// sampleRate`,
                ],
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['node1', 'node2', 'node3'],
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                // blockSize
                // sampleRate
            `)
        )
    })

    it('should not fail when node implementation has no "declare" hook', () => {
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
                declare: () => ``,
                loop: () => ``,
                messages: () => ({
                    '0_message': '// [osc~] message receiver',
                }),
            },
            'dac~': {
                loop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['osc', 'dac'],
            nodeImplementations,
        })

        assert.doesNotThrow(() => compileDeclare(compilation))
    })
})
