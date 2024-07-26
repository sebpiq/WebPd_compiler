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
import {
    GlobalCodeDefinition,
    GlobalCodeGenerator,
    GlobalCodeGeneratorWithSettings,
} from '../types'
import precompileDependencies, {
    collectAndDedupeExports,
    collectAndDedupeImports,
    flattenDependencies,
    instantiateAndDedupeDependencies,
} from './dependencies'
import { Class, Func, Sequence, ast } from '../../ast/declare'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { PrecompiledCode } from './types'
import {
    makeGlobalCodePrecompilationContext,
    makePrecompilation,
} from '../test-helpers'

describe('precompile.dependencies', () => {
    describe('default', () => {
        it('should collect, precompile and deduplicate nested dependencies code and add minimal dependencies', () => {
            // ARRANGE
            const codeDefinition1 = {
                codeGenerator: () => ast`"bli"`,
                dependencies: [() => ast`"bla"`, () => ast`"ble"`],
            }

            const codeDefinition2 = {
                codeGenerator: () => ast`"blu"`,
                dependencies: [
                    () => ast`"bly"`,
                    () => ast`"blo"`,
                    codeDefinition1,
                ],
            }

            const dependencies: Array<GlobalCodeDefinition> = [
                () => ast`"bla"`,
                codeDefinition2,
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']>(
                precompilation.precompiledCode.dependencies,
                {
                    ast: Sequence([
                        ast`"bla"`,
                        ast`"bly"`,
                        ast`"blo"`,
                        ast`"ble"`,
                        ast`"bli"`,
                        ast`"blu"`,
                    ]),
                    exports: [],
                    imports: [],
                }
            )
        })

        it('should collect, precompile and deduplicate imports and exports', () => {
            // ARRANGE
            const codeDefinition1 = {
                codeGenerator: () => ast`"bli"`,
                dependencies: [] as Array<GlobalCodeDefinition>,
                imports: () => [Func('bla')``, Func('bli')``],
                exports: () => ['ble', 'blo'],
            }
            const codeDefinition2 = {
                codeGenerator: () => ast`"blu"`,
                dependencies: [codeDefinition1],
                imports: () => [Func('bli')``],
                exports: () => ['blo'],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                () => ast`"bla"`,
                codeDefinition2,
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']['exports']>(
                precompilation.precompiledCode.dependencies.exports,
                ['ble', 'blo']
            )
            assert.deepStrictEqual<PrecompiledCode['dependencies']['imports']>(
                precompilation.precompiledCode.dependencies.imports,
                [Func('bla')``, Func('bli')``]
            )
        })

        it('should add new variables to the namespace', () => {
            // ARRANGE
            const dependencies: Array<GlobalCodeDefinition> = [
                ({ globalCode }) =>
                    Sequence([
                        Func(globalCode.module1!.func1!)``,
                        Class(globalCode.module1!.Class1!, []),
                        Func(globalCode.module2!.func2!)``,
                    ]),
            ]

            const graph = makeGraph({
                node1: {
                    type: 'type1',
                },
            })

            const nodeImplementations = {
                type1: {
                    dependencies,
                },
            }

            const precompilation = makePrecompilation({
                graph,
                nodeImplementations,
            })

            precompilation.precompiledCode.graph.fullTraversal = ['node1']

            // ACT
            precompileDependencies(precompilation, [])

            // ASSERT
            assert.deepStrictEqual<PrecompiledCode['dependencies']>(
                precompilation.precompiledCode.dependencies,
                {
                    ast: Sequence([
                        Func('C_module1_func1')``,
                        Class('C_module1_Class1', []),
                        Func('C_module2_func2')``,
                    ]),
                    exports: [],
                    imports: [],
                }
            )
        })
    })

    describe('collectDependencies', () => {
        it('should compile the global code, removing duplicates', () => {
            const precompilation = makePrecompilation({})

            const bli = ast`"bli"`
            const blo = ast`"blo"`
            const bla1 = ast`"bla"`
            const bla2 = ast`"bla"`

            const bloGenerator: GlobalCodeGenerator = () => blo
            const blaGenerator1: GlobalCodeGenerator = () => bla1
            const blaGenerator2: GlobalCodeGenerator = () => bla2
            const astSequence = instantiateAndDedupeDependencies(
                [
                    bloGenerator,
                    blaGenerator1,
                    {
                        codeGenerator: () => bli,
                        dependencies: [bloGenerator],
                    },
                    blaGenerator2,
                ],
                makeGlobalCodePrecompilationContext(precompilation)
            )
            assert.deepStrictEqual(astSequence, Sequence([blo, bla1, bli]))
        })
    })

    describe('flattenDependencies', () => {
        it('should render code and dependencies recursively, dependencies should come first', () => {
            const codeGenerator1 = () => ast`"bla"`
            const codeGenerator2 = () => ast`"bli"`
            const codeGenerator3 = () => ast`"blo"`
            const codeGenerator4 = () => ast`"blu"`
            const codeGenerator5 = () => ast`"bly"`
            const codeGenerator6 = () => ast`"ble"`

            const codeDefinition1 = {
                codeGenerator: codeGenerator2,
                dependencies: [codeGenerator1, codeGenerator6],
            }
            const codeDefinition2 = {
                codeGenerator: codeGenerator4,
                dependencies: [codeGenerator5, codeGenerator3, codeDefinition1],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                codeGenerator1,
                codeDefinition2,
            ]
            const generated = flattenDependencies(dependencies)

            assert.strictEqual(generated.length, 7)
            assert.strictEqual(generated[0], codeGenerator1)
            assert.strictEqual(generated[1], codeGenerator5)
            assert.strictEqual(generated[2], codeGenerator3)
            assert.strictEqual(generated[3], codeGenerator1)
            assert.strictEqual(generated[4], codeGenerator6)
            assert.strictEqual(generated[5], codeDefinition1)
            assert.strictEqual(generated[6], codeDefinition2)
        })
    })

    describe('collectAndDedupeExports', () => {
        it('should collect exports and remove duplicates', () => {
            const precompilation = makePrecompilation({})
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                exports: () => ['ex1', 'ex3'],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                // no exports here shouldnt break
                dependencies: [],
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                exports: () => ['ex4', 'ex3'],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                codeDefinition1,
                () => Sequence([]),
                codeDefinition2,
                codeDefinition3,
                () => Sequence([]),
            ]

            assert.deepStrictEqual(
                collectAndDedupeExports(
                    dependencies,
                    makeGlobalCodePrecompilationContext(precompilation)
                ),
                ['ex1', 'ex3', 'ex4']
            )
        })
    })

    describe('collectAndDedupeImports', () => {
        it('should collect imports and remove duplicates', () => {
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                imports: () => [Func('ex1')``, Func('ex3')``],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                // no imports here shouldnt break
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => Sequence([]),
                imports: () => [Func('ex4')``],
            }
            const dependencies: Array<GlobalCodeDefinition> = [
                () => Sequence([]),
                codeDefinition1,
                codeDefinition2,
                () => Sequence([]),
                codeDefinition3,
            ]

            assert.deepStrictEqual(
                collectAndDedupeImports(
                    dependencies,
                    makeGlobalCodePrecompilationContext(makePrecompilation({}))
                ),
                [Func('ex1')``, Func('ex3')``, Func('ex4')``]
            )
        })
    })
})
