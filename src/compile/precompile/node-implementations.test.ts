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
import { Class, Func, Sequence, Var } from '../../ast/declare'
import { makeGraph } from '../../test-helpers/graph-test-helpers'
import { NodeImplementations } from '../types'
import {
    STATE_CLASS_NAME,
    precompileCore,
    precompileStateClass,
} from './node-implementations'
import { AstClass, AstSequence } from '../../ast/types'
import { makePrecompilation } from '../test-helpers'

describe('precompile.node-implementations', () => {
    describe('precompileStateClass', () => {
        it('should precompile stateClass in variableNamesIndex', () => {
            const graph = makeGraph({
                // Needed as a sample node insance to compile `NodeImplementation.state`
                n1: {
                    isPullingSignal: true,
                    type: 'type1',
                    args: { a: 22, b: 33 },
                },
            })

            const nodeImplementations: NodeImplementations = {
                type1: {
                    state: ({ ns, node: { args } }) =>
                        Class(ns[STATE_CLASS_NAME]!, [
                            Var(ns.SomeClass!, `a`, args.a),
                            Var(`Int`, `b`, args.b),
                        ]),
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })
            // Ensure that the `SomeClass` is defined in the namespace
            precompilation.variableNamesAssigner.nodeImplementations.type1!
                .SomeClass!

            precompileStateClass(precompilation, 'type1')

            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodeImplementations.type1,
                {
                    State: 'NT_type1_State',
                    SomeClass: 'NT_type1_SomeClass',
                }
            )
            assert.deepStrictEqual<AstClass>(
                precompilation.precompiledCode.nodeImplementations.type1!
                    .stateClass,
                Class('NT_type1_State', [
                    Var(`NT_type1_SomeClass`, `a`),
                    Var(`Int`, `b`),
                ])
            )
        })
    })

    describe('precompileCore', () => {
        it('should precompile core and add all names to the namespace in variableNamesIndex', () => {
            const nodeImplementations: NodeImplementations = {
                type1: {
                    core: ({ ns }) =>
                        Sequence([Func(ns.bla!)``, Func(ns.blo!)``]),
                },
            }

            const precompilation = makePrecompilation({
                nodeImplementations,
            })

            precompileCore(precompilation, 'type1')

            assert.deepStrictEqual<AstSequence>(
                precompilation.precompiledCode.nodeImplementations.type1!.core,
                Sequence([Func('NT_type1_bla')``, Func('NT_type1_blo')``])
            )

            assert.deepStrictEqual(
                precompilation.variableNamesIndex.nodeImplementations.type1,
                {
                    bla: 'NT_type1_bla',
                    blo: 'NT_type1_blo',
                }
            )
        })
    })
})
