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

import { jest } from '@jest/globals'
import assert from "assert"
import { Compilation } from "../compilation"
import { round } from "../test-helpers"
import { CompilerSettings, NodeImplementations, PortSpecs } from "../types"
import compileToAssemblyscript from "./compile-to-assemblyscript"
import { compileWasmModule } from "./test-helpers"
import { AssemblyScriptWasmExports } from "./types"
import { createEngine } from "./assemblyscript-wasm-bindings"

describe('compileToAssemblyscript', () => {
    
    jest.setTimeout(10000)

    const COMPILER_SETTINGS: CompilerSettings = {
        channelCount: 2,
        target: 'assemblyscript',
        bitDepth: 32,
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
    }

    it('should create the specified ports', async () => {
        const settings = {
            ...COMPILER_SETTINGS,
            portSpecs: {
                bla: { access: 'r', type: 'float' },
                blo: { access: 'w', type: 'messages' },
                bli: { access: 'rw', type: 'float' },
                blu: { access: 'rw', type: 'messages' },
            } as PortSpecs,
        }
        const compilation = new Compilation({}, NODE_IMPLEMENTATIONS, settings)
        const wasmModule = await compileWasmModule(`
            let bla: f32 = 1
            let blo: Message[]
            let bli: f32 = 2
            let bluMessage1: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING, 4 ])
            let bluMessage2: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT ])
            let blu: Message[] = [bluMessage1, bluMessage2]
            let blu2: Message[] = [bluMessage2]

            export function getBlu2(): Message[] {
                return blu2
            }
            export function getBluMessage1(): Message {
                return bluMessage1
            }
            export function getBluMessage2(): Message {
                return bluMessage2
            }

            ${compileToAssemblyscript(compilation)}
        `)
        const engine = await createEngine(wasmModule, settings)
        const wasmExports = engine.wasmExports as any
        
        const portFunctionKeys = Object.keys(wasmExports)
            .filter(key => key.startsWith('read_') || key.startsWith('write_'))
        
        assert.deepStrictEqual(
            portFunctionKeys.sort(),
            [
                'read_bla', 
                'write_blo', 
                'read_bli', 'write_bli', 
                'read_blu_length', 'read_blu_elem', 'write_blu'
            ].sort()
        )

        assert.strictEqual(wasmExports.read_bla(), 1)

        assert.strictEqual(wasmExports.read_bli(), 2)
        wasmExports.write_bli(666.666)
        assert.strictEqual(round(wasmExports.read_bli()), 666.666)

        assert.deepStrictEqual(wasmExports.read_blu_length(), 2)
        assert.strictEqual(wasmExports.read_blu_elem(0), wasmExports.getBluMessage1())
        assert.strictEqual(wasmExports.read_blu_elem(1), wasmExports.getBluMessage2())

        const blu2Pointer = wasmExports.getBlu2()
        wasmExports.write_blu(blu2Pointer)
        assert.deepStrictEqual(wasmExports.read_blu_length(), 1)
        assert.strictEqual(wasmExports.read_blu_elem(0), wasmExports.getBluMessage2())
    })

    it('should be a wasm engine when compiled', async () => {
        const compilation = new Compilation({},
            {},
            COMPILER_SETTINGS
        )
        const wasmModule = await compileWasmModule(compileToAssemblyscript(compilation))
        const engine = await createEngine(wasmModule, {...COMPILER_SETTINGS, portSpecs: {}})
        const wasmExports = engine.wasmExports as any

        const expectedExports: AssemblyScriptWasmExports = {
            configure: (_: number) => 0,
            loop: () => new Float32Array(),
            setArray: () => undefined,
            memory: new WebAssembly.Memory({ initial: 128 }),
            MESSAGE_DATUM_TYPE_FLOAT: new WebAssembly.Global({ value: 'i32' }),
            MESSAGE_DATUM_TYPE_STRING: new WebAssembly.Global({ value: 'i32' }),
            createMessage: () => 0,
            getMessageDatumTypes: () => 0,
            createMessageArray: () => 0,
            pushMessageToArray: () => undefined,
            writeStringDatum: () => undefined,
            writeFloatDatum: () => undefined,
            readStringDatum: () => 0,
            readFloatDatum: () => 0,
            __new: () => 0,
        }

        // Plenty of low-level exported function are added by asc compiler when using 
        // option 'export-runtime'
        const exportsIgnoredKeys = [
            '__collect',
            '__pin',
            '__rtti_base',
            '__unpin',
        ]
                
        const actualExportsKeys = Object.keys(wasmExports)
            .filter(key => !exportsIgnoredKeys.includes(key))

        assert.deepStrictEqual(
            actualExportsKeys.sort(),
            Object.keys(expectedExports).sort(),
        )
    })
})