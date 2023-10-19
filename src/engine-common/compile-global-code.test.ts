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
import { getMacros } from '../compile'
import {
    GlobalCodeDefinition,
    GlobalCodeGeneratorContext,
    GlobalCodeGeneratorWithSettings,
} from '../types'
import compileGlobalCode, {
    _renderCodeDefinitionsRecursive,
    collectExports,
    collectImports,
} from './compile-global-code'
import { makeCompilation } from '../test-helpers'

describe('compile-global-code', () => {
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
                compileGlobalCode(COMPILATION, [
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

    describe('_renderCodeDefinitionsRecursive', () => {
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
            const globalCodeDefinitions: Array<GlobalCodeDefinition> = [
                codeGenerator1,
                codeDefinition2,
            ]

            assert.deepStrictEqual(
                _renderCodeDefinitionsRecursive(CONTEXT, globalCodeDefinitions),
                ['bla', 'bly', 'blo', 'bla', 'ble', 'bli', 'blu']
            )
        })
    })

    describe('collectExports', () => {
        it('should collect exports recursively and remove duplicates', () => {
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                exports: [{ name: 'ex1' }, { name: 'ex3' }],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                // no exports here shouldnt break the chain
                dependencies: [() => ``, codeDefinition1],
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                exports: [{ name: 'ex4' }],
                dependencies: [codeDefinition2],
            }
            const globalCodeDefinitions: Array<GlobalCodeDefinition> = [
                () => ``,
                codeDefinition3,
            ]

            assert.deepStrictEqual(
                collectExports('javascript', globalCodeDefinitions),
                [{ name: 'ex1' }, { name: 'ex3' }, { name: 'ex4' }]
            )
        })

        it('should keep only exports for specified target', () => {
            const codeGenerator1 = () => 'bla'
            const codeGenerator2 = () => 'bli'
            const codeGenerator3 = () => 'blo'

            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: codeGenerator1,
                exports: [
                    { name: 'ex1' },
                    { name: 'ex3', targets: ['javascript'] },
                ],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: codeGenerator2,
                exports: [
                    { name: 'ex2', targets: ['javascript'] },
                    { name: 'ex4', targets: ['assemblyscript'] },
                    { name: 'ex3', targets: ['assemblyscript'] },
                ],
                dependencies: [codeGenerator3, codeDefinition1],
            }
            const globalCodeDefinitions: Array<GlobalCodeDefinition> = [
                codeGenerator1,
                codeDefinition2,
            ]

            assert.deepStrictEqual(
                collectExports('assemblyscript', globalCodeDefinitions),
                [
                    { name: 'ex1' },
                    { name: 'ex4', targets: ['assemblyscript'] },
                    { name: 'ex3', targets: ['assemblyscript'] },
                ]
            )
        })
    })

    describe('collectImports', () => {
        it('should collect imports recursively and remove duplicates', () => {
            const codeDefinition1: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                imports: [
                    { name: 'ex1', args: [], returns: 'void' },
                    { name: 'ex3', args: [], returns: 'void' },
                ],
            }
            const codeDefinition2: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                // no imports here shouldnt break the chain
                dependencies: [() => ``, codeDefinition1],
            }
            const codeDefinition3: GlobalCodeGeneratorWithSettings = {
                codeGenerator: () => ``,
                imports: [{ name: 'ex4', args: [], returns: 'void' }],
                dependencies: [codeDefinition2],
            }
            const globalCodeDefinitions: Array<GlobalCodeDefinition> = [
                () => ``,
                codeDefinition3,
            ]

            assert.deepStrictEqual(collectImports(globalCodeDefinitions), [
                { name: 'ex1', args: [], returns: 'void' },
                { name: 'ex3', args: [], returns: 'void' },
                { name: 'ex4', args: [], returns: 'void' },
            ])
        })
    })
})
