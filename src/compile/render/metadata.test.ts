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
    makePrecompilation,
    precompilationToRenderInput,
} from '../test-helpers'
import { buildMetadata } from './metadata'
import { Func } from '../../ast/declare'

describe('metadata', () => {
    describe('buildMetadata', () => {
        it('should filter exported and imported functions from compilation object and add them to variableNamesIndex', () => {
            const precompilation = makePrecompilation({})
            precompilation.variableNamesIndex.globals.bla = {
                hello: 'bla_hello',
                bye: 'bla_bye',
                blah: 'bla_blah',
            }
            precompilation.variableNamesIndex.globals.blo = {
                good: 'blo_good',
                blurg: 'blo_blurg',
            }
            precompilation.precompiledCode.dependencies.exports = [
                'bla_hello',
                'blo_good',
            ]
            precompilation.precompiledCode.dependencies.imports = [
                Func('bla_blah')``,
                Func('blo_blurg')``,
            ]
            const renderInput = precompilationToRenderInput(precompilation)
            const metadata = buildMetadata(renderInput)

            assert.deepStrictEqual(
                metadata.compilation.variableNamesIndex.globals,
                {
                    bla: {
                        hello: 'bla_hello',
                        blah: 'bla_blah',
                    },
                    blo: {
                        good: 'blo_good',
                        blurg: 'blo_blurg',
                    },
                }
            )
        })
    })
})
