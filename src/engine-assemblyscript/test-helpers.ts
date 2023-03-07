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

import asc from 'assemblyscript/asc'
import { AudioSettings, Code } from '../types'
import { createEngine } from '../test-helpers'
import { AssemblyScriptWasmEngine } from './AssemblyScriptWasmEngine'

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
