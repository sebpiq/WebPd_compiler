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
import generateLoop from './generate-loop'
import { makeGraph } from '../dsp-graph/test-helpers'
import { Ast } from '../ast/declare'
import { AstContainer } from '../ast/types'
import { normalizeCodeForTests } from '../ast/test-helpers'

describe('generateLoop', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        print: {},
        'osc~': {
            generateLoop: ({ node }) =>
                Ast`// [osc~] : frequency ${node.args.frequency}`,
        },
        '+~': {
            generateLoop: ({ node }) => Ast`// [+~] : value ${node.args.value}`,
        },
        'dac~': {
            generateLoop: ({ compilation: { audioSettings } }) =>
                Ast`// [dac~] : channelCount ${audioSettings.channelCount.out}`,
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
            graph,
            graphTraversalLoop: ['osc', 'plus', 'dac'],
            nodeImplementations: NODE_IMPLEMENTATIONS,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: 32,
            },
        })

        const ast = generateLoop(compilation)

        assert.deepStrictEqual<AstContainer>(normalizeCodeForTests(ast), {
            astType: 'Container',
            content: [
                `for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n` +
                '// [osc~] : frequency 440\n' +
                '// [+~] : value 110\n' +
                '// [dac~] : channelCount 2\n' +
                `FRAME++\n}`,
            ],
        })
    })

    it('should generate loop for inline nodes', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
                outlets: { '0': { id: '0', type: 'signal' } },
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateLoopInline: () => 'BLA',
            },
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalLoop: ['node1'],
            nodeImplementations,
        })

        compilation.precompilation.node1.outs['0'] = 'node1_OUTS_0'

        const ast = generateLoop(compilation)

        assert.deepStrictEqual(normalizeCodeForTests(ast), {
            astType: 'Container',
            content: [
                'for (F = 0; F < BLOCK_SIZE; F++) {\n_commons_emitFrame(FRAME)\n' + 
                'node1_OUTS_0 = BLA\n' + 
                'FRAME++\n}'
            ],
        })
    })

    it('should throw error for nodes with no loop function', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {},
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalLoop: ['node1'],
            nodeImplementations,
        })

        assert.throws(() => generateLoop(compilation))
    })
})
