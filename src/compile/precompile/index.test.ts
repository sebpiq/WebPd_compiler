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
import { makeGraph } from '../../dsp-graph/test-helpers'
import { makeCompilation } from '../../test-helpers'
import precompile from '.'
import { DspGroup, NodeImplementations } from '../types'
import { ast } from '../../ast/declare'

describe('precompile', () => {
    it('should precompile the inline loop code', () => {
        //       [  nonInline1  ]
        //         |
        //       [  n1  ]
        //            \
        // [  n2  ]  [  n3  ]
        //   \        /
        //    \      /
        //     \    /
        //    [  n4  ]
        //       |
        //    [  nonInline2  ]
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
                type: 'inlinableType1',
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
                type: 'inlinableType0',
                args: { value: 'N2' },
                sinks: {
                    '0': [['n4', '0']],
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
            n3: {
                type: 'inlinableType1',
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
                type: 'inlinableType2',
                args: { value: 'N4' },
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'signal', id: '1' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    '0': [['nonInline2', '0']],
                },
            },
            nonInline2: {
                type: 'signalType',
                isPullingSignal: true,
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            inlinableType0: {
                inlineLoop: ({ node: { args } }) => ast`${args.value} + 1`,
            },
            inlinableType1: {
                inlineLoop: ({ node: { args }, ins }) =>
                    ast`${ins.$0} * ${args.value}`,
            },
            inlinableType2: {
                inlineLoop: ({ node: { args }, ins }) =>
                    ast`${args.value} * ${ins.$0} - ${args.value} * ${ins.$1}`,
            },
            signalType: {
                loop: () => ast`// loop signalType`,
            },
        }

        const compilation = makeCompilation({
            graph,
            nodeImplementations,
        })

        precompile(compilation)

        assert.strictEqual(
            compilation.precompilation.nodes.nonInline2.generationContext
                .signalIns.$0,
            '(N4 * (N2 + 1) - N4 * ((nonInline1_OUTS_0 * N1) * N3))'
        )

        assert.deepStrictEqual<DspGroup>(
            compilation.precompilation.graph.hotDspGroup,
            {
                traversal: ['nonInline1', 'nonInline2'],
                outNodesIds: ['nonInline2'],
            }
        )
    })

    it('should precompile cold dsp subgraphs and play well with inline loops', () => {
        //
        //           [  n1  ]  <- inlinable & cold dsp
        //             |
        // [  n3  ]  [  n2  ]  <- inlinable but also out node of the dsp group
        //   \        /
        //    \      /
        //     \    /
        //    [  n4  ]
        //
        const graph = makeGraph({
            n1: {
                type: 'inlinableAndColdType',
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n2', '0']],
                },
            },
            n2: {
                type: 'inlinableAndColdType',
                inlets: {
                    '0': { type: 'signal', id: '0' },
                },
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n4', '0']],
                },
            },
            n3: {
                type: 'signalType',
                outlets: {
                    '0': { type: 'signal', id: '0' },
                },
                sinks: {
                    0: [['n4', '1']],
                },
            },
            n4: {
                type: 'signalType',
                isPullingSignal: true,
                inlets: {
                    '0': { type: 'signal', id: '0' },
                    '1': { type: 'signal', id: '1' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            signalType: {
                loop: () => ast`// loop signalType`,
            },
            inlinableAndColdType: {
                flags: {
                    isPureFunction: true,
                },
                inlineLoop: ({ ins }) => ast`1 + ${ins.$0}`,
            },
        }

        const compilation = makeCompilation({ graph, nodeImplementations })

        precompile(compilation)

        assert.deepStrictEqual<DspGroup>(
            compilation.precompilation.graph.hotDspGroup,
            {
                traversal: ['n3', 'n4'],
                outNodesIds: ['n4'],
            }
        )

        assert.deepStrictEqual<{[groupId: string]: DspGroup}>(
            compilation.precompilation.graph.coldDspGroups,
            {
                '0': {
                    // n1 has been inlined
                    traversal: ['n2'],
                    outNodesIds: ['n2'],
                },
            }
        )

        assert.strictEqual(
            compilation.precompilation.nodes.n2.generationContext.signalIns.$0,
            '(1 + NULL_SIGNAL)'
        )
    })
})
