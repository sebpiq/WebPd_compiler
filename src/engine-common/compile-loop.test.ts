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
import compileLoop from './compile-loop'

describe('compileLoop', () => {
    jest.setTimeout(10000)

    const COMPILER_SETTINGS: CompilerSettings = {
        channelCount: 2,
        target: 'javascript',
        bitDepth: 32,
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        msg: {
            initialize: () => ``,
            loop: (node) =>
                `// [msg] : value ${node.args.value}`,
        },
        '+': {
            initialize: () => ``,
            loop: (node) =>
                `// [+] : value ${node.args.value}`,
        },
        print: {
            initialize: () => ``,
            loop: (node, _, __) =>
                `// [print] : value "${node.args.value}"`,
        },
        'osc~': {
            initialize: () => ``,
            loop: (node) =>
                `// [osc~] : frequency ${node.args.frequency}`,
        },
        '+~': {
            initialize: () => ``,
            loop: (node) =>
                `// [+~] : value ${node.args.value}`,
        },
        'dac~': {
            initialize: () => ``,
            loop: (_, __, settings) =>
                `// [dac~] : channelCount ${settings.channelCount}`,
        },
    }


    it('should compile the loop function, pass around control messages, and cleanup control inlets and outlets', () => {
        const graph = makeGraph({
            msg: {
                type: 'msg',
                sinks: {
                    '0': [
                        ['plus', '0'],
                        ['print', '0'],
                    ],
                },
                args: {
                    value: 2,
                },
                outlets: { '0': { id: '0', type: 'control' } },
            },
            plus: {
                type: '+',
                sinks: {
                    '0': [['print', '0']],
                },
                args: {
                    value: 1,
                },
                inlets: { '0': { id: '0', type: 'control' } },
                outlets: { '0': { id: '0', type: 'control' } },
            },
            print: {
                type: 'print',
                args: {
                    value: 'bla',
                },
                inlets: { '0': { id: '0', type: 'control' } },
            },
        })

        const compilation = new Compilation(
            graph,
            NODE_IMPLEMENTATIONS,
            COMPILER_SETTINGS,
        )

        const loop = compileLoop(compilation, [
            graph.msg,
            graph.plus,
            graph.print,
        ])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            // [msg] : value 2
            for (O = 0; O < msg_OUTS_0.length; O++) {
                plus_INS_0.push(msg_OUTS_0[O])
            }
            for (O = 0; O < msg_OUTS_0.length; O++) {
                print_INS_0.push(msg_OUTS_0[O])
            }

            // [+] : value 1
            for (O = 0; O < plus_OUTS_0.length; O++) {
                print_INS_0.push(plus_OUTS_0[O])
            }

            // [print] : value "bla"

            if (msg_OUTS_0.length) {
                msg_OUTS_0 = []
            }
            if (plus_INS_0.length) {
                plus_INS_0 = []
            }
            if (plus_OUTS_0.length) {
                plus_OUTS_0 = []
            }
            if (print_INS_0.length) {
                print_INS_0 = []
            }
        `)
        )
    })

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

        const compilation = new Compilation(
            graph,
            NODE_IMPLEMENTATIONS,
            COMPILER_SETTINGS,
        )

        const loop = compileLoop(compilation, [
            graph.osc,
            graph.plus,
            graph.dac,
        ])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            // [osc~] : frequency 440
            plus_INS_0 = osc_OUTS_0
            dac_INS_0 = osc_OUTS_0
        
            // [+~] : value 110
            dac_INS_1 = plus_OUTS_0

            // [dac~] : channelCount 2
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

        const compilation = new Compilation(
            graph,
            NODE_IMPLEMENTATIONS,
            COMPILER_SETTINGS,
        )

        const loop = compileLoop(compilation, [graph.osc, graph.dac])

        assert.strictEqual(
            normalizeCode(loop),
            normalizeCode(`
            // [osc~] : frequency 440
            dac_INS_0 = osc_OUTS_0
            // [dac~] : channelCount 2
        `)
        )
    })

})