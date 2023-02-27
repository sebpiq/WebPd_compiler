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
        print: {},
        'osc~': {
            loop: ({ node }) => `// [osc~] : frequency ${node.args.frequency}`,
        },
        '+~': {
            loop: ({ node }) => `// [+~] : value ${node.args.value}`,
        },
        'dac~': {
            loop: ({ compilation: { audioSettings } }) =>
                `// [dac~] : channelCount ${audioSettings.channelCount.out}`,
        },
    }

    it('should compile the loop function', () => {
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
                    // Test that adding a message connection doesn't cause an error
                    '1': [['dac', '2']],
                },
                args: {
                    value: 110,
                },
                inlets: { '0': { id: '0', type: 'signal' } },
                outlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'message' },
                },
            },
            dac: {
                type: 'dac~',
                args: {
                    value: 'bla',
                },
                inlets: {
                    '0': { id: '0', type: 'signal' },
                    '1': { id: '1', type: 'signal' },
                    '2': { id: '2', type: 'message' },
                },
            },
        })

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            graphTraversal: ['osc', 'plus', 'dac'],
            nodeImplementations: NODE_IMPLEMENTATIONS,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const loop = compileLoop(compilation)

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            for (F = 0; F < BLOCK_SIZE; F++) {
                _commons_emitFrame(FRAME)
                // [osc~] : frequency 440
                // [+~] : value 110
                // [dac~] : channelCount 2
                FRAME++
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
            graphTraversal: ['print', 'dac'],
            nodeImplementations: NODE_IMPLEMENTATIONS,
        })

        const loop = compileLoop(compilation)

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            for (F = 0; F < BLOCK_SIZE; F++) {
                _commons_emitFrame(FRAME)
                // [dac~] : channelCount 2
                FRAME++
            }
        `)
        )
    })
})
