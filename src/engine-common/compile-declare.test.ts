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
    const GLOBAL_VARIABLES_CODE = `
        let F
        let O
        let FRAME 
        let BLOCK_SIZE
        let SAMPLE_RATE
        const ARRAYS = new Map()
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
                declare: (node, _) =>
                    `// [osc~] frequency ${node.args.frequency}`,
                loop: () => ``,
            },
            'dac~': {
                declare: (_, __, { audioSettings }) =>
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
                }

                function anotherFloat_RCVS_0 (m) {
                    // [float] message receiver
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
