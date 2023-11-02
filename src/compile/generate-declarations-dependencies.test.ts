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
import { getMacros } from '.'
import { GlobalCodeDefinition, GlobalCodeGeneratorContext } from './types'
import generateDeclarationsDependencies, {
    _generateDependenciesDeclarationsRecursive,
} from './generate-declarations-dependencies'
import { makeCompilation } from '../test-helpers'

describe('generate-declarations-dependencies', () => {
    const CONTEXT: GlobalCodeGeneratorContext = {
        target: 'javascript',
        audioSettings: {
            bitDepth: 32,
            channelCount: { in: 2, out: 2 },
        },
        macros: getMacros('javascript'),
    }

    const COMPILATION = makeCompilation({})

    describe('default', () => {
        it('should compile the global code, removing duplicates', () => {
            assert.strictEqual(
                generateDeclarationsDependencies(COMPILATION, [
                    () => 'blo',
                    {
                        codeGenerator: () => 'bli',
                        dependencies: [() => 'blo'],
                    },
                ]),
                'blo\nbli'
            )
        })
    })

    describe('_generateDependenciesDeclarationsRecursive', () => {
        it('should render code and dependencies recursively, dependencies should coem first', () => {
            const codeGenerator1 = () => 'bla'
            const codeGenerator2 = () => 'bli'
            const codeGenerator3 = () => 'blo'
            const codeGenerator4 = () => 'blu'
            const codeGenerator5 = () => 'bly'
            const codeGenerator6 = () => 'ble'

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

            assert.deepStrictEqual(
                _generateDependenciesDeclarationsRecursive(
                    CONTEXT,
                    dependencies
                ),
                ['bla', 'bly', 'blo', 'bla', 'ble', 'bli', 'blu']
            )
        })
    })
})
