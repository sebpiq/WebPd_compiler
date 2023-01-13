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
import {
    compileEventArraysChanged,
    compileEventConfigure,
    getEventCode,
} from './compile-events'

describe('compile-events', () => {
    describe('getEventCode', () => {
        it('should not fail when node implementation has no configure event hook', () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                },
                dac: {
                    type: 'dac~',
                },
            })

            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    events: () => ({}),
                },
                'dac~': {},
            }

            const compilation = makeCompilation({
                target: 'assemblyscript',
                graph,
                nodeImplementations,
                audioSettings: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 32,
                },
            })

            assert.doesNotThrow(() =>
                getEventCode(compilation, graph.osc, 'configure')
            )
        })
    })

    describe('compileEventArraysChanged', () => {
        it('should compile the arrayc changed code', () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                },
                dac: {
                    type: 'dac~',
                },
            })

            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    events: () => ({
                        arraysChanged: `// [osc~] arrays changed`,
                    }),
                },
                'dac~': {
                    events: () => ({
                        arraysChanged: `// [dac~] arrays changed`,
                    }),
                },
            }

            const compilation = makeCompilation({
                target: 'assemblyscript',
                graph,
                nodeImplementations,
                audioSettings: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 32,
                },
            })

            const code = compileEventArraysChanged(compilation, [
                graph.osc,
                graph.dac,
            ])

            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                // [osc~] arrays changed
                // [dac~] arrays changed
            `)
            )
        })
    })

    describe('compileEventConfigure', () => {
        it('should compile the configure code', () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                    args: {
                        frequency: 440,
                    },
                },
                dac: {
                    type: 'dac~',
                },
            })

            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    events: (node, _) => ({
                        configure: `// [osc~] frequency ${node.args.frequency}`,
                    }),
                    loop: () => ``,
                },
                'dac~': {
                    events: (_, __, { audioSettings }) => ({
                        configure: `// [dac~] channelCount ${audioSettings.channelCount.out}`,
                    }),
                    loop: () => ``,
                },
            }

            const compilation = makeCompilation({
                target: 'assemblyscript',
                graph,
                nodeImplementations,
                audioSettings: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 32,
                },
            })

            const code = compileEventConfigure(compilation, [
                graph.osc,
                graph.dac,
            ])

            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                F = 0
                O = 0
                FRAME = 0
                // [osc~] frequency 440
                // [dac~] channelCount 2                
            `)
            )
        })
    })
})
