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
import compileLoop from './compile-loop'

describe('compileLoop', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        print: {
            initialize: () => ``,
        },
        'osc~': {
            initialize: () => ``,
            loop: (node) => `// [osc~] : frequency ${node.args.frequency}`,
        },
        '+~': {
            initialize: () => ``,
            loop: (node) => `// [+~] : value ${node.args.value}`,
        },
        'dac~': {
            initialize: () => ``,
            loop: (_, __, { audioSettings }) =>
                `// [dac~] : channelCount ${audioSettings.channelCount.out}`,
        },
    }

    it('should compile the loop function and pass around signal', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                sinks: {
                    '0': [
                        ['plus', '0'],
                        ['dac', '0'],
                    ],
                },
                args: {
                    frequency: 440,
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            plus: {
                type: '+~',
                sinks: {
                    '0': [['dac', '1']],
                },
                args: {
                    value: 110,
                },
                inlets: { '0': { id: '0', type: 'signal' } },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            dac: {
                type: 'dac~',
                args: {
                    value: 'bla',
                },
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
            },
        })

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations: NODE_IMPLEMENTATIONS,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const loop = compileLoop(compilation, [
            graph.osc,
            graph.plus,
            graph.dac,
        ])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            for (F = 0; F < BLOCK_SIZE; F++) {
                FRAME++
                // [osc~] : frequency 440
                plus_INS_0 = osc_OUTS_0
                dac_INS_0 = osc_OUTS_0
            
                // [+~] : value 110
                dac_INS_1 = plus_OUTS_0

                // [dac~] : channelCount 2
            }
        `)
        )
    })

    it('should omit operations for nodes not connected to an end sink, even if their source is', () => {
        const graph = makeGraph({
            // [osc~] is connected to end sink [dac~] AND to [+~]
            // But [+~] isn't connected to [dac~] and therefore should be entirely
            // omited from compilation.
            osc: {
                type: 'osc~',
                sinks: {
                    '0': [
                        ['plus', '0'],
                        ['dac', '0'],
                    ],
                },
                args: {
                    frequency: 440,
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            plus: {
                type: '+~',
                sinks: {},
                args: {
                    value: 110,
                },
                inlets: { '0': { id: '0', type: 'signal' } },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
            dac: {
                type: 'dac~',
                args: {
                    value: 'bla',
                },
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
            },
        })

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations: NODE_IMPLEMENTATIONS,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const loop = compileLoop(compilation, [graph.osc, graph.dac])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            for (F = 0; F < BLOCK_SIZE; F++) {
                FRAME++
                // [osc~] : frequency 440
                dac_INS_0 = osc_OUTS_0
                // [dac~] : channelCount 2
            }
        `)
        )
    })

    it('should ignore nodes that implement no loop function', () => {
        const graph = makeGraph({
            print: {
                type: 'print',
                args: {
                    messages: ['bla', 'hello'],
                },
                inlets: { '0': { id: '0', type: 'message' } },
            },
            dac: {
                type: 'dac~',
                args: {
                    value: 'bla',
                },
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                },
            },
        })

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            nodeImplementations: NODE_IMPLEMENTATIONS,
        })

        const loop = compileLoop(compilation, [
            graph.print,
            graph.dac,
        ])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            for (F = 0; F < BLOCK_SIZE; F++) {
                FRAME++
                // [dac~] : channelCount 2
            }
        `)
        )
    })
})
