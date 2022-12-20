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
import macros from '../engine-javascript/macros'

describe('compileDeclare', () => {
    it('should compile the variables declaration code', () => {
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
            macros,
        })

        const declareCode = compileDeclare(compilation, [graph.osc, graph.dac])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
            let F
            let O
            let FRAME 
            let BLOCK_SIZE
            let SAMPLE_RATE

            let osc_INS_0_message = []
            let osc_INS_0_signal
            let osc_OUTS_0
            // [osc~] frequency 440
            
            let dac_INS_0
            let dac_INS_1
            // [dac~] channelCount 2                
        `)
        )
    })

    it('should not fail when node implementation has no declare hook', () => {
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
                declare: (node, _) =>
                    `// [osc~] frequency ${node.args.frequency}`,
                loop: () => ``,
            },
            'dac~': {
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
            macros: macros,
        })

        assert.doesNotThrow(() =>
            compileDeclare(compilation, [graph.osc, graph.dac])
        )
    })
})
