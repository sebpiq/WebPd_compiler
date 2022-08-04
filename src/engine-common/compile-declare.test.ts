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
import { makeGraph } from '@webpd/shared/test-helpers'
import { NodeImplementations, CompilerSettings } from '../types'
import { Compilation } from '../compilation'
import { normalizeCode } from '../test-helpers'
import { jest } from '@jest/globals'
import compileDeclare from './compile-declare'

describe('compileDeclare', () => {
    jest.setTimeout(10000)

    const COMPILER_SETTINGS: CompilerSettings = {
        channelCount: 2,
        target: 'javascript',
        bitDepth: 32,
    }

    it('should compile the variables declaration code', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
                inlets: {
                    '0_control': { id: '0_control', type: 'control' },
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
                declare: (_, __, settings) =>
                    `// [dac~] channelCount ${settings.channelCount}`,
                loop: () => ``,
            },
        }

        const compilation = new Compilation(
            graph,
            nodeImplementations,
            COMPILER_SETTINGS
        )

        const declareCode = compileDeclare(compilation, [graph.osc, graph.dac])

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
            let F
            let O
            let FRAME 
            let BLOCK_SIZE
            let SAMPLE_RATE

            let osc_INS_0_control
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
                    '0_control': { id: '0_control', type: 'control' },
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

        const compilation = new Compilation(
            graph,
            nodeImplementations,
            COMPILER_SETTINGS
        )

        assert.doesNotThrow(() => compileDeclare(compilation, [graph.osc, graph.dac]))
    })
})
