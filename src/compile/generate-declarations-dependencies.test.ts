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
import { GlobalCodeDefinition, GlobalCodeGenerator } from './types'
import generateDeclarationsDependencies, {
    _flattenDependencies,
} from './generate-declarations-dependencies'
import { makeCompilation } from '../test-helpers'
import { Ast } from '../ast/declare'

describe('generate-declarations-dependencies', () => {
    const COMPILATION = makeCompilation({})

    describe('default', () => {
        it('should compile the global code, removing duplicates', () => {
            const bli = Ast`"bli"`
            const blo = Ast`"blo"`
            const bloGenerator: GlobalCodeGenerator = () => blo
            const generated = generateDeclarationsDependencies(COMPILATION, [
                bloGenerator,
                {
                    codeGenerator: () => bli,
                    dependencies: [bloGenerator],
                },
            ])
            assert.strictEqual(generated.length, 2)
            assert.strictEqual(generated[0], blo)
            assert.strictEqual(generated[1], bli)
        })
    })

    describe('_flattenDependencies', () => {
        it('should render code and dependencies recursively, dependencies should come first', () => {
            const codeGenerator1 = () => Ast`"bla"`
            const codeGenerator2 = () => Ast`"bli"`
            const codeGenerator3 = () => Ast`"blo"`
            const codeGenerator4 = () => Ast`"blu"`
            const codeGenerator5 = () => Ast`"bly"`
            const codeGenerator6 = () => Ast`"ble"`

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
            const generated = _flattenDependencies(dependencies)

            assert.strictEqual(generated.length, 7)
            assert.strictEqual(generated[0], codeGenerator1)
            assert.strictEqual(generated[1], codeGenerator5)
            assert.strictEqual(generated[2], codeGenerator3)
            assert.strictEqual(generated[3], codeGenerator1)
            assert.strictEqual(generated[4], codeGenerator6)
            assert.strictEqual(generated[5], codeGenerator2)
            assert.strictEqual(generated[6], codeGenerator4)
        })
    })
})
