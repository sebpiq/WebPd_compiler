/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd 
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
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
