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

        const expectedExports: AssemblyScriptWasmExports & AssemblyScriptWasmImports & AscRuntimeExports = {
            configure: (_: number) => undefined,
            getOutput: () => 0,
            getInput: () => 0,
            loop: () => new Float32Array(),
            setArray: () => undefined,
            tarray_create: (_: number) => 0,
            tarray_createListOfArrays: () => 0,
            tarray_pushToListOfArrays: (_: number, __: number) => undefined,
            tarray_getListOfArraysLength: (_: number) => 0,
            tarray_getListOfArraysElem: (_: number, __: number) => 0,
            metadata: new WebAssembly.Global({ value: 'i32' }),
            MSG_FLOAT_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            MSG_STRING_TOKEN: new WebAssembly.Global({ value: 'i32' }),
            msg_create: () => 0,
            msg_getTokenTypes: () => 0,
            msg_createArray: () => 0,
            msg_pushToArray: () => undefined,
            msg_writeStringToken: () => undefined,
            msg_writeFloatToken: () => undefined,
            msg_readStringToken: () => 0,
            msg_readFloatToken: () => 0,
            fs_onReadSoundFileResponse: () => 0,
            fs_onWriteSoundFileResponse: () => 0,
            fs_onCloseSoundStream: () => 0,
            fs_onSoundStreamData: () => 0,
            i_fs_readSoundFile: () => undefined,
            i_fs_writeSoundFile: () => undefined,
            i_fs_openSoundReadStream: () => undefined,
            i_fs_openSoundWriteStream: () => undefined,
            i_fs_sendSoundStreamData: () => undefined,
            i_fs_closeSoundStream: () => undefined,
            __new: () => 0,
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

    it('should export specific accessors for messages', async () => {
        const filterPortFunctionKeys = (wasmExports: any) =>
            Object.keys(wasmExports).filter(
                (key) => key.startsWith('read_') || key.startsWith('write_')
            )

        const { wasmExports } = await createAscEngine(
            `
            let blo: Message[] = []
        ` +
                compileToAssemblyscript(
                    makeCompilation({
                        target: 'assemblyscript',
                        accessorSpecs: {
                            blo: { access: 'r', type: 'message' },
                        },
                    })
                )
        )

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            ['read_blo_length', 'read_blo_elem'].sort()
        )
    })
})
