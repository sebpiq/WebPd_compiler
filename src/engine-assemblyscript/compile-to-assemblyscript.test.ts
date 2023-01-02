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
import { AssemblyScriptWasmExports } from './types'

describe('compileToAssemblyscript', () => {

    it('should have all expected wasm exports when compiled', async () => {
        const { wasmExports } = await createAscEngine(
            compileToAssemblyscript(makeCompilation({
                target: 'assemblyscript',
            }))
        )

        const expectedExports: AssemblyScriptWasmExports = {
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
            MSG_DATUM_TYPE_FLOAT: new WebAssembly.Global({ value: 'i32' }),
            MSG_DATUM_TYPE_STRING: new WebAssembly.Global({ value: 'i32' }),
            msg_create: () => 0,
            msg_getDatumTypes: () => 0,
            msg_createArray: () => 0,
            msg_pushToArray: () => undefined,
            msg_writeStringDatum: () => undefined,
            msg_writeFloatDatum: () => undefined,
            msg_readStringDatum: () => 0,
            msg_readFloatDatum: () => 0,
            fs_readSoundFileResponse: () => 0,
            fs_writeSoundFileResponse: () => 0,
            fs_soundStreamClose: () => 0,
            fs_soundStreamData: () => 0,
            fs_requestCloseSoundStream: () => 0,
            fs_requestReadSoundFile: () => 0,
            fs_requestReadSoundStream: () => 0,
            fs_requestWriteSoundFile: () => 0,
            __new: () => 0,
            memory: new WebAssembly.Memory({ initial: 128 }),
        }

        // Plenty of low-level exported function are added by asc compiler when using
        // option 'export-runtime'
        const exportsIgnoredKeys = [
            '__collect',
            '__pin',
            '__rtti_base',
            '__unpin',
        ]

        const actualExportsKeys = Object.keys(wasmExports).filter(
            (key) => !exportsIgnoredKeys.includes(key)
        )

        assert.deepStrictEqual(
            actualExportsKeys.sort(),
            Object.keys(expectedExports).sort()
        )
    })
    
    it('should export specific accessors for messages', async () => {
        const filterPortFunctionKeys = (wasmExports: any) =>
        Object.keys(wasmExports).filter(
            (key) => key.startsWith('read_') || key.startsWith('write_')
        )

        const {wasmExports} = await createAscEngine(`
            let blo: Message[] = []
        ` + compileToAssemblyscript(makeCompilation({
                target: 'assemblyscript',
                accessorSpecs: {
                    blo: { access: 'r', type: 'message' },
                },
            })),
        )

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_blo_length',
                'read_blo_elem',
            ].sort()
        )
    })
})
