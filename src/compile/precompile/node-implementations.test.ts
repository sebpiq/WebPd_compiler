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
                {
                    astType: 'Class',
                    name: 'State_type1',
                    members: [
                        {
                            astType: 'Var',
                            type: 'Int',
                            name: 'a',
                            value: undefined,
                        },
                        {
                            astType: 'Var',
                            type: 'Int',
                            name: 'b',
                            value: undefined,
                        },
                    ],
                }
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
                {
                    astType: 'Sequence',
                    content: [
                        {
                            astType: 'Func',
                            name: 'bla',
                            args: [],
                            returnType: 'void',
                            body: ast``,
                        },
                    ],
                }
            )
        })
    })
})
