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
import compileInitialize from './compile-initialize'
import macros from '../engine-assemblyscript/macros'

describe('compileInitialize', () => {
    it('should compile the initialize code', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
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
                outlets: {},
            },
        })

        const nodeImplementations: NodeImplementations = {
            'osc~': {
                initialize: (node, _) =>
                    `// [osc~] frequency ${node.args.frequency}`,
                loop: () => ``,
            },
            'dac~': {
                initialize: (_, __, { audioSettings }) =>
                    `// [dac~] channelCount ${audioSettings.channelCount}`,
                loop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'assemblyscript',
            graph,
            nodeImplementations,
            audioSettings: {
                channelCount: 2,
                bitDepth: 32,
            },
            macros: macros,
        })

        const initializeCode = compileInitialize(compilation, [
            graph.osc,
            graph.dac,
        ])

        assert.strictEqual(
            normalizeCode(initializeCode),
            normalizeCode(`
            F = 0
            O = 0
            FRAME = -1

            osc_INS_0_message = []
            osc_INS_0_signal = 0
            osc_OUTS_0 = 0
            // [osc~] frequency 440
            
            dac_INS_0 = 0
            dac_INS_1 = 0
            // [dac~] channelCount 2                
        `)
        )
    })

    it('should not fail when node implementation has no initialize hook', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
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
                outlets: {},
            },
        })

        const nodeImplementations: NodeImplementations = {
            'osc~': {
                loop: () => ``,
            },
            'dac~': {
                initialize: (_, __, { audioSettings }) =>
                    `// [dac~] channelCount ${audioSettings.channelCount}`,
                loop: () => ``,
            },
        }

        const compilation = makeCompilation({
            target: 'assemblyscript',
            graph,
            nodeImplementations,
            audioSettings: {
                channelCount: 2,
                bitDepth: 32,
            },
            macros: macros,
        })

        assert.doesNotThrow(() =>
            compileInitialize(compilation, [graph.osc, graph.dac])
        )
    })
})
