/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from 'assert'
import { compileWasmModule } from './test-helpers'
import { readMetadata } from './wasm-bindings'
import {
    AccessorSpecs,
} from '../types'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { makeCompilation } from '../test-helpers'
import { EngineMetadata } from './types'

describe('AssemblyScriptWasmEngine', () => {

    describe('readMetadata', () => {
        it('should extract the metadata', async () => {
            const accessorSpecs: AccessorSpecs = {
                bla: { access: 'r', type: 'signal' },
            }

            const compilation = makeCompilation({
                target: 'assemblyscript',
                accessorSpecs,
            })

            const wasmBuffer = await compileWasmModule(
                compileToAssemblyscript(compilation) + `
                    let bla: f32 = 1
                `
            )

            const metadata = await readMetadata(wasmBuffer)

            assert.deepStrictEqual(metadata, {
                compilation: {
                    audioSettings: compilation.audioSettings,
                    accessorSpecs,
                    inletListenerSpecs: compilation.inletListenerSpecs,
                    engineVariableNames: compilation.engineVariableNames,
                },
            } as EngineMetadata)
        })
    })
})
