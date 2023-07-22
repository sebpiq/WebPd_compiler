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
import { compileAscCode } from '../test-helpers'
import compileToAssemblyscript from '../compile-to-assemblyscript'
import { makeCompilation } from '../../test-helpers'
import { EngineMetadata } from '../../types'
import { readMetadata } from './engine-core-bindings'

describe('engine-core-bindings', () => {
    describe('readMetadata', () => {
        it('should extract the metadata', async () => {
            const compilation = makeCompilation({
                target: 'assemblyscript',
                inletCallerSpecs: {},
                outletListenerSpecs: {},
            })

            const wasmBuffer = await compileAscCode(
                compileToAssemblyscript(compilation) +
                    `
                    let bla: f32 = 1
                `,
                32
            )

            const metadata = await readMetadata(wasmBuffer)

            assert.deepStrictEqual<EngineMetadata>(metadata, {
                audioSettings: {
                    ...compilation.audioSettings,
                    blockSize: 0,
                    sampleRate: 0,
                },
                compilation: {
                    codeVariableNames: {
                        inletCallers:
                            compilation.codeVariableNames.inletCallers,
                        outletListeners:
                            compilation.codeVariableNames.outletListeners,
                    },
                    inletCallerSpecs: {},
                    outletListenerSpecs: {},
                },
            })
        })
    })
})
