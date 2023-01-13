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
import { makeCompilation } from '../test-helpers'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { createAscEngine } from './test-helpers'
import { AssemblyScriptWasmExports, AssemblyScriptWasmImports } from './types'

describe('compileToAssemblyscript', () => {
    it('should have all expected wasm exports when compiled', async () => {
        interface AscRuntimeExports {
            __collect: () => void
            __pin: () => void
            __rtti_base: () => void
            __unpin: () => void
        }

        const { wasmExports } = await createAscEngine(
            compileToAssemblyscript(
                makeCompilation({
                    target: 'assemblyscript',
                })
            )
        )

        const expectedExports: AssemblyScriptWasmExports &
            AssemblyScriptWasmImports &
            AscRuntimeExports = {
            configure: () => undefined,
            getOutput: () => undefined,
            getInput: () => undefined,
            loop: () => new Float32Array(),
            tarray_get: () => undefined,
            tarray_set: () => undefined,
            tarray_create: () => undefined,
            tarray_createListOfArrays: () => undefined,
            tarray_pushToListOfArrays: () => undefined,
            tarray_getListOfArraysLength: () => undefined,
            tarray_getListOfArraysElem: () => undefined,
            metadata: new WebAssembly.Global({ value: 'i32' }),
            MSG_FLOAT_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            MSG_STRING_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            msg_create: () => undefined,
            msg_getTokenTypes: () => undefined,
            msg_writeStringToken: () => undefined,
            msg_writeFloatToken: () => undefined,
            msg_readStringToken: () => undefined,
            msg_readFloatToken: () => undefined,
            fs_onReadSoundFileResponse: () => undefined,
            fs_onWriteSoundFileResponse: () => undefined,
            fs_onCloseSoundStream: () => undefined,
            fs_onSoundStreamData: () => undefined,
            i_fs_readSoundFile: () => undefined,
            i_fs_writeSoundFile: () => undefined,
            i_fs_openSoundReadStream: () => undefined,
            i_fs_openSoundWriteStream: () => undefined,
            i_fs_sendSoundStreamData: () => undefined,
            i_fs_closeSoundStream: () => undefined,
            __new: () => undefined,
            memory: new WebAssembly.Memory({ initial: 128 }),
            __collect: () => undefined,
            __pin: () => undefined,
            __rtti_base: () => undefined,
            __unpin: () => undefined,
        }

        assert.deepStrictEqual(
            Object.keys(wasmExports).sort(),
            Object.keys(expectedExports).sort()
        )
    })
})
