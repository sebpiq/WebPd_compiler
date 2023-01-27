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
import { AudioSettings, Code } from '../types'
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
}

export const compileWasmModule = async (
    ascCode: Code,
    bitDepth: AudioSettings['bitDepth']
): Promise<ArrayBuffer> => {
    const options: any = {
        optimizeLevel: 3,
        runtime: 'incremental',
        exportRuntime: true,
    }
    if (bitDepth === 32) {
        options.use = ['Math=NativeMathf']
    }
    const { error, binary, stderr } = await asc.compileString(ascCode, options)
    if (error) {
        throw new Error(stderr.toString())
    }
    return binary
}

export const createAscEngine = async (
    code: Code,
    bitDepth: AudioSettings['bitDepth']
) => {
    const engine = (await createEngine(
        'assemblyscript',
        bitDepth,
        code
    )) as unknown as AssemblyScriptWasmEngine
    return { engine, wasmExports: engine.wasmExports as any }
}
