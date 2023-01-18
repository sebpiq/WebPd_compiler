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

import { liftString } from './core-code/core-bindings'
import { StringPointer, AssemblyScriptWasmExports } from './types'

// REF : Assemblyscript ESM bindings
export const instantiateWasmModule = async (
    wasmBuffer: ArrayBuffer,
    wasmImports: any = {}
) => {
    const instanceAndModule = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            abort: (
                messagePointer: StringPointer,
                // filename, not useful because we compile everything to a single string
                _: StringPointer,
                lineNumber: number,
                columnNumber: number
            ) => {
                const message = liftString(wasmExports, messagePointer)
                lineNumber = lineNumber
                columnNumber = columnNumber
                ;(() => {
                    // @external.js
                    throw Error(
                        `${message} at ${lineNumber}:${columnNumber}`
                    )
                })()
            },
            seed: () => {
                return (() => {
                    return Date.now() * Math.random()
                })()
            },
            'console.log': (textPointer: StringPointer) => {
                console.log(liftString(wasmExports, textPointer))
            },
        },
        ...wasmImports,
    })
    const wasmExports = instanceAndModule.instance
        .exports as unknown as AssemblyScriptWasmExports
    return instanceAndModule.instance
}
