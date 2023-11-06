/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from 'assert'
import { NodeImplementations } from './types'
import { makeCompilation } from '../test-helpers'
import generateLoopInline from './generate-loop-inline'
import { makeGraph } from '../dsp-graph/test-helpers'
import { initializePrecompilation } from './precompile'

describe('generateLoopInline', () => {

    it('should compile the inline loop code', () => {
        //       [  n1  ]
        //            \
        // [  n2  ]  [  n3  ]
        //   \        /
        //    \      /
        //     \    /
        //    [  n4  ]
        const graph = makeGraph({
            n1: {
                type: 'inlineType0',
                args: { value: 'N1' },
                sinks: {
                    '0': [['n3', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n2: {
                type: 'inlineType0',
                args: { value: 'N2' },
                sinks: {
                    '0': [['n4', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n3: {
                type: 'inlineType1',
                args: { value: 'N3' },
                sinks: {
                    '0': [['n4', '1']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n4: {
                type: 'inlineType2',
                args: { value: 'N4' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'signal', id: '1' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            'inlineType0': {
                generateLoopInline: ({ node: { args }}) =>
                    `${args.value} + 1`,
            },
            'inlineType1': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${ins.$0} * ${args.value}`,
            },
            'inlineType2': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
            },
        }

        const compilation = makeCompilation({
            graph,
            nodeImplementations,
        })

        assert.strictEqual(
            generateLoopInline(compilation, ['n1', 'n2', 'n3', 'n4']),
            '(N4 * (N2 + 1) - N4 * ((N1 + 1) * N3))',
        )
    })

    it('shouldnt cause any problem with message inlets', () => {
        // [  n1  ]  [  n0  ]
        //       \    /     
        //      [  n2  ]  
        //         |
        //         |
        //         |
        //      [  n3  ]
        const graph = makeGraph({
            n0: {
                type: 'messageType',
                isPushingMessages: true,
                outlets: {
                    '0': { type: 'message', id: '0' },
                },
                sinks: {
                    '0': [['n2', '1']],
                }
            },
            n1: {
                type: 'inlineType0',
                args: { value: 'N1' },
                sinks: {
                    '0': [['n2', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n2: {
                type: 'inlineType1',
                args: { value: 'N2' },
                sinks: {
                    '0': [['n3', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'message', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n3: {
                type: 'inlineType1',
                args: { value: 'N3' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'message', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            'messageType': {},
            'inlineType0': {
                generateLoopInline: ({ node: { args }}) =>
                    `${args.value} + 1`,
            },
            'inlineType1': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${ins.$0} * ${args.value}`,
            },
        }

        const compilation = makeCompilation({
            graph,
            nodeImplementations,
        })

        assert.strictEqual(
            generateLoopInline(compilation, ['n1', 'n2', 'n3']),
            '(((N1 + 1) * N2) * N3)',
        )
    })

    it('shouldnt fail with non-connected signal inlet', () => {
        // [  n1  ]
        //       \    /     
        //      [  n2  ]  
        //         |
        //         |
        //         |
        //      [  n3  ]
        const graph = makeGraph({
            n1: {
                type: 'inlineType0',
                args: { value: 'N1' },
                sinks: {
                    '0': [['n2', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n2: {
                type: 'inlineType2',
                args: { value: 'N2' },
                sinks: {
                    '0': [['n3', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    // Inlet to another node / or unconnected
                    '1': { type: 'signal', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n3: {
                type: 'inlineType1',
                args: { value: 'N3' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'message', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            'inlineType0': {
                generateLoopInline: ({ node: { args }}) =>
                    `${args.value} + 1`,
            },
            'inlineType1': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${ins.$0} * ${args.value}`,
            },
            'inlineType2': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
            },
        }

        const precompilation = initializePrecompilation(graph)
        precompilation.n2.ins.$1 = 'BLA'

        const compilation = makeCompilation({
            graph,
            nodeImplementations,
            precompilation,
        })

        assert.strictEqual(
            generateLoopInline(compilation, ['n1', 'n2', 'n3']),
            '((N2 * (N1 + 1) - N2 * BLA) * N3)',
        )
    })

    it('shouldnt fail with non-inlinable source', () => {
        const graph = makeGraph({
            nonInline1: {
                type: 'signalType',
                sinks: {
                    '0': [['n1', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n1: {
                type: 'inlineType1',
                args: { value: 'N1' },
                sinks: {
                    '0': [['n2', '0']],
                },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n2: {
                type: 'inlineType1',
                args: { value: 'N2' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            'inlineType1': {
                generateLoopInline: ({ node: { args }, ins }) =>
                    `${ins.$0} * ${args.value}`,
            },
            'signalType': {},
        }

        const precompilation = initializePrecompilation(graph)
        precompilation.n1.ins.$0 = 'nonInline1_OUTS_0'

        const compilation = makeCompilation({
            graph,
            nodeImplementations,
            precompilation,
        })

        assert.strictEqual(
            generateLoopInline(compilation, ['n1', 'n2']),
            '((nonInline1_OUTS_0 * N1) * N2)',
        )
    })
})
