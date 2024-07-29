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
import { GlobalsDefinitions } from '../types'
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
            const globalsDefinitions1: GlobalsDefinitions = {
                namespace: 'module1',
                code: () => ast`"bli"`,
                dependencies: [
                    { namespace: '_', code: () => ast`"bla"` },
                    { namespace: '_', code: () => ast`"ble"` },
                ],
            }

            const globalsDefinitions2: GlobalsDefinitions = {
                namespace: 'module2',
                code: () => ast`"blu"`,
                dependencies: [
                    { namespace: '_', code: () => ast`"bly"` },
                    { namespace: '_', code: () => ast`"blo"` },
                    globalsDefinitions1,
                ],
            }

            const dependencies: Array<GlobalsDefinitions> = [
                { namespace: '_', code: () => ast`"bla"` },
                globalsDefinitions2,
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
            const globalsDefinitions1: GlobalsDefinitions = {
                namespace: 'module1',
                code: () => ast`"bli"`,
                dependencies: [] as Array<GlobalsDefinitions>,
                imports: () => [Func('bla')``, Func('bli')``],
                exports: () => ['ble', 'blo'],
            }
            const globalsDefinitions2: GlobalsDefinitions = {
                namespace: 'module2',
                code: () => ast`"blu"`,
                dependencies: [globalsDefinitions1],
                imports: () => [Func('bli')``],
                exports: () => ['blo'],
            }
            const dependencies: Array<GlobalsDefinitions> = [
                { namespace: '_', code: () => ast`"bla"` },
                globalsDefinitions2,
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
            const dependencies: Array<GlobalsDefinitions> = [
                {
                    namespace: 'module1',
                    code: (module1) =>
                        Sequence([
                            Func(module1.func1!)``,
                            Class(module1.Class1!, []),
                        ]),
                },
                {
                    namespace: 'module2',
                    code: (module2) => Sequence([Func(module2.func2!)``]),
                },
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

            const bloDefinitions: GlobalsDefinitions = {
                namespace: '_',
                code: () => blo,
            }
            const blaDefinitions1: GlobalsDefinitions = {
                namespace: '_',
                code: () => bla1,
            }
            const blaDefinitions2: GlobalsDefinitions = {
                namespace: '_',
                code: () => bla2,
            }
            const astSequence = instantiateAndDedupeDependencies(
                [
                    bloDefinitions,
                    blaDefinitions1,
                    {
                        namespace: 'module1',
                        code: () => bli,
                        dependencies: [bloDefinitions],
                    },
                    blaDefinitions2,
                ],
                precompilation.variableNamesAssigner,
                makeGlobalCodePrecompilationContext(precompilation)
            )
            assert.deepStrictEqual(astSequence, Sequence([blo, bla1, bli]))
        })
    })

    describe('flattenDependencies', () => {
        it('should render code and dependencies recursively, dependencies should come first', () => {
            const globalsDefinitions1: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"bla"`,
            }
            const globalsDefinitions2: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"bli"`,
            }
            const globalsDefinitions3: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"blo"`,
            }
            const globalsDefinitions4: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"bly"`,
            }
            const globalsDefinitions5: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"ble"`,
                dependencies: [globalsDefinitions2],
            }

            const globalsDefinitions6: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"blb"`,
                dependencies: [globalsDefinitions1, globalsDefinitions5],
            }
            const globalsDefinitions7: GlobalsDefinitions = {
                namespace: '_',
                code: () => ast`"blc"`,
                dependencies: [
                    globalsDefinitions4,
                    globalsDefinitions3,
                    globalsDefinitions1,
                ],
            }
            const dependencies: Array<GlobalsDefinitions> = [
                globalsDefinitions6,
                globalsDefinitions7,
            ]
            const generated = flattenDependencies(dependencies)

            assert.strictEqual(generated.length, 8)
            assert.deepStrictEqual(generated[0], globalsDefinitions1)
            assert.deepStrictEqual(generated[1], globalsDefinitions2)
            assert.deepStrictEqual(generated[2], globalsDefinitions5)
            assert.deepStrictEqual(generated[3], globalsDefinitions6)
            assert.deepStrictEqual(generated[4], globalsDefinitions4)
            assert.deepStrictEqual(generated[5], globalsDefinitions3)
            assert.deepStrictEqual(generated[6], globalsDefinitions1)
            assert.deepStrictEqual(generated[7], globalsDefinitions7)
        })
    })

    describe('collectAndDedupeExports', () => {
        it('should collect exports and remove duplicates', () => {
            const precompilation = makePrecompilation({})
            const globalsDefinitions1: GlobalsDefinitions = {
                namespace: 'module1',
                code: () => Sequence([]),
                exports: () => ['ex1', 'ex3'],
            }
            const globalsDefinitions2: GlobalsDefinitions = {
                namespace: 'module2',
                code: () => Sequence([]),
                // no exports here shouldnt break
                dependencies: [],
            }
            const globalsDefinitions3: GlobalsDefinitions = {
                namespace: 'module3',
                code: () => Sequence([]),
                exports: () => ['ex4', 'ex3'],
            }
            const dependencies: Array<GlobalsDefinitions> = [
                globalsDefinitions1,
                { namespace: '_', code: () => Sequence([]) },
                globalsDefinitions2,
                globalsDefinitions3,
                { namespace: '_', code: () => Sequence([]) },
            ]

            assert.deepStrictEqual(
                collectAndDedupeExports(
                    dependencies,
                    precompilation.variableNamesAssigner,
                    makeGlobalCodePrecompilationContext(precompilation)
                ),
                ['ex1', 'ex3', 'ex4']
            )
        })
    })

    describe('collectAndDedupeImports', () => {
        it('should collect imports and remove duplicates', () => {
            const precompilation = makePrecompilation({})
            const globalsDefinitions1: GlobalsDefinitions = {
                namespace: 'module1',
                code: () => Sequence([]),
                imports: () => [Func('ex1')``, Func('ex3')``],
            }
            const globalsDefinitions2: GlobalsDefinitions = {
                namespace: 'module2',
                code: () => Sequence([]),
                // no imports here shouldnt break
            }
            const globalsDefinitions3: GlobalsDefinitions = {
                namespace: 'module3',
                code: () => Sequence([]),
                imports: () => [Func('ex4')``],
            }
            const dependencies: Array<GlobalsDefinitions> = [
                { namespace: '_', code: () => Sequence([]) },
                globalsDefinitions1,
                globalsDefinitions2,
                { namespace: '_', code: () => Sequence([]) },
                globalsDefinitions3,
            ]

            assert.deepStrictEqual(
                collectAndDedupeImports(
                    dependencies,
                    precompilation.variableNamesAssigner,
                    makeGlobalCodePrecompilationContext(precompilation)
                ),
                [Func('ex1')``, Func('ex3')``, Func('ex4')``]
            )
        })
    })
})
