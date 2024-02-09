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
import { Class, Func, Sequence, Var, ast } from '../../ast/declare'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { NodeImplementations } from '../types'
import { precompileCore, precompileStateClass } from './node-implementations'
import { AstClass, AstSequence } from '../../ast/types'
import { makePrecompilation } from '../test-helpers'

describe('precompile.node-implementations', () => {
    describe('precompileStateClass', () => {
        it('should precompile stateClass', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                    type: 'type1',
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    state: ({ node: { args } }) =>
                        Class('State_type1', [
                            Var('Int', 'a', args.a),
                            Var('Int', 'b', args.b),
                        ]),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileStateClass(precompilation, 'type1')

            assert.strictEqual(precompilation.output.variableNamesIndex.nodeImplementations.type1!.stateClass, 'State_type1')
            assert.deepStrictEqual<AstClass>(
                precompilation.output.nodeImplementations.type1!.stateClass,
                Class(
                    'State_type1',
                    [
                        Var('Int', 'a'),
                        Var('Int', 'b'),
                    ],
                )
            )
        })
    })

    describe('precompileCore', () => {
        it('should precompile core', () => {
            const graph = makeGraph({
                n1: {
                    isPullingSignal: true,
                    type: 'type1',
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    core: () => Sequence([Func('bla')``])
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompileCore(precompilation, 'type1')

            assert.deepStrictEqual<AstSequence>(
                precompilation.output.nodeImplementations.type1!.core,
                Sequence([
                    Func('bla')``
                ])
            )
        })
    })
})
