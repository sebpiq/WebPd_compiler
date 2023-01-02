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
import {
    MSG_DATUM_TYPE_FLOAT,
    MSG_DATUM_TYPE_STRING,
} from '../constants'
import { Code } from '../types'
import { MSG_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'
import { createEngine } from '../test-helpers'
import { AssemblyScriptWasmEngine } from './AssemblyScriptWasmEngine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const getAssemblyscriptCoreCode = () => {
    return readFileSync(resolve(__dirname, 'core-code.asc'))
        .toString()
        .replaceAll('${FloatArray}', 'Float64Array')
        .replaceAll('${Float}', 'f64')
        .replaceAll('${getFloat}', 'getFloat64')
        .replaceAll('${setFloat}', 'setFloat64')
        .replaceAll(
            '${MSG_DATUM_TYPE_FLOAT}',
            MSG_DATUM_TYPES_ASSEMBLYSCRIPT[
                MSG_DATUM_TYPE_FLOAT
            ].toString()
        )
        .replaceAll(
            '${MSG_DATUM_TYPE_STRING}',
            MSG_DATUM_TYPES_ASSEMBLYSCRIPT[
                MSG_DATUM_TYPE_STRING
            ].toString()
        )
}

export const compileWasmModule = async (
    ascCode: Code
): Promise<ArrayBuffer> => {
    const { error, binary, stderr } = await asc.compileString(ascCode, {
        optimizeLevel: 3,
        runtime: 'stub',
        exportRuntime: true,
        // For 32 bits version of Math, not needed since we do tests with bitDepth 64
        // use: ['Math=NativeMathf'],
    })
    if (error) {
        throw new Error(stderr.toString())
    }
    return binary
}

export const createAscEngine = async (code: Code) => {
    const engine = await createEngine('assemblyscript', code) as AssemblyScriptWasmEngine
    return {engine, wasmExports: engine.wasmExports as any}
}
