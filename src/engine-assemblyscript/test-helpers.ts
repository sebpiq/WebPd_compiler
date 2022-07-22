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

import { readFileSync } from 'fs'
import asc from 'assemblyscript/asc'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from '../engine-common'
import { Code } from '../types';
import { liftArrayBufferOfIntegers, liftString, MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './bindings';
import assert from 'assert'
import { AssemblyScriptWasmEngine, InternalPointer } from './types'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename)

export const getAssemblyscriptCoreCode = () => {
    return readFileSync(resolve(__dirname, 'core-code.asc')).toString()
        .replaceAll('${FloatArrayType}', 'Float32Array')
        .replaceAll('${FloatType}', 'f32')
        .replaceAll('${getFloat}', 'getFloat32')
        .replaceAll('${setFloat}', 'setFloat32')
        .replaceAll('${MESSAGE_DATUM_TYPE_FLOAT}', MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT].toString()) 
        .replaceAll('${MESSAGE_DATUM_TYPE_STRING}', MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING].toString())
        + `
        export function testGetMessageBuffer (message: Message): ArrayBuffer {
            return message.dataView.buffer
        }
        `
}

export const compileAssemblyScript = async (code: Code) => {
    const { error, binary, stderr } = await asc.compileString(code, {
        optimizeLevel: 3,
        runtime: "stub",
        exportRuntime: true,
        // For tests we use f32, so we need to compile with the f32 version of `Math`
        use: ['Math=NativeMathf'],
    })
    if (error) {
        throw new Error(stderr.toString())
    }

    const wasmModule = await WebAssembly.instantiate(binary.buffer, {
        env: {
            // memory,
            abort: function() {},
            seed() {
                // ~lib/builtins/seed() => f64
                return (() => {
                  // @external.js
                  return Date.now() * Math.random()
                })()
            },
            // log: function(a) { console.log(a) }
            "console.log"(pointer: number) {
                // ~lib/bindings/dom/console.log(~lib/string/String) => void
                const text = liftString(wasmModule.instance.exports as any, pointer);
                console.log(text);
            },
        },
    })
    return wasmModule
}

export const assertMessageRawContentsEqual = (
    engine: AssemblyScriptWasmEngine, 
    messagePointer: InternalPointer, 
    expected: Array<number>
) => {
    const messageBufferPointer = (engine as any).testGetMessageBuffer(messagePointer)
    assert.deepStrictEqual(liftArrayBufferOfIntegers(engine, messageBufferPointer), expected)
}