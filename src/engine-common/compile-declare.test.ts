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
import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import { NodeImplementations } from '../types'
import { makeCompilation, normalizeCode } from '../test-helpers'
import compileDeclare from './compile-declare'

describe('compileDeclare', () => {
    const GLOBAL_VARIABLES_CODE_NO_EVENTS = `
        let F
        let FRAME 
        let BLOCK_SIZE
        let SAMPLE_RATE
    `

    const GLOBAL_VARIABLES_CODE =
        GLOBAL_VARIABLES_CODE_NO_EVENTS +
        `
        function _events_ArraysChanged () {
        }
    `

    it('should compile declaration for global variables', () => {
        const graph = makeGraph({})

        const nodeImplementations: NodeImplementations = {}

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [])

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
            nodeImplementations,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const declareCode = compileDeclare(compilation, [graph.osc, graph.dac])

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
                    '1': { id: '1', type: 'signal' },
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
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [graph.add])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                
                let add_INS_1 = 0
                function add_RCVS_0 (m) {
                    // [+] message receiver
                    throw new Error('[+], id "add", inlet "0", unsupported message : ' + msg_display(m))
                }
            `)
        )
    })

    it('should compile inlet senders for message inlets', () => {
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
            inletCallerSpecs: { add: ['0'] },
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [graph.add])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                
                function add_RCVS_0 (m) {
                    // [+] message receiver
                    throw new Error('[+], id "add", inlet "0", unsupported message : ' + msg_display(m))
                }
                function inletCaller_add_0 (m) {add_RCVS_0(m)}
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
            nodeImplementations,
        })

        assert.throws(() => compileDeclare(compilation, [graph.add]))
    })

    it('shouldnt throw an error if message receiver is implemented but string empty', () => {
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
            nodeImplementations,
        })

        assert.doesNotThrow(() => compileDeclare(compilation, [graph.add]))
    })

    it('should compile node message senders for message outlets', () => {
        const graph = makeGraph({
            // Sending messages to several sinks,
            twenty: {
                type: 'twenty',
                outlets: {
                    '0': { id: '0', type: 'message' },
                    // Outlet without connection
                    '1': { id: '1', type: 'message' },
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
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [
            graph.twenty,
            graph.aFloat,
            graph.anotherFloat,
        ])

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

                function twenty_SNDS_1 (m) {
                }

                const aFloat_SNDS_0 = anotherFloat_RCVS_0
            `)
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
            nodeImplementations,
            outletListenerSpecs: { add: ['0', '2'] },
        })

        const declareCode = compileDeclare(compilation, [
            graph.add,
            graph.aFloat,
        ])

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
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [
            graph.node1,
            graph.node2,
            graph.node3,
        ])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE}
                // blockSize
                // sampleRate
            `)
        )
    })

    it('should inject arrays change event handlers', () => {
        const graph = makeGraph({
            someNode: {
                type: 'float',
            },
        })

        const nodeImplementations: NodeImplementations = {
            float: {
                events: () => ({
                    arraysChanged: '// [float] arrays changed',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations,
        })

        const declareCode = compileDeclare(compilation, [graph.someNode])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                ${GLOBAL_VARIABLES_CODE_NO_EVENTS}
                function _events_ArraysChanged () {
                    // [float] arrays changed
                }
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
            nodeImplementations,
        })

        assert.doesNotThrow(() =>
            compileDeclare(compilation, [graph.osc, graph.dac])
        )
    })
})
