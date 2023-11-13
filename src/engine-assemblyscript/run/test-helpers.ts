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
import { AudioSettings } from '../../compile/types'
import { Code } from '../../ast/types'
import { RawModule } from '../../run/types'
import { instantiateWasmModule } from './wasm-helpers'

export const TEST_PARAMETERS = [
    { bitDepth: 32 as AudioSettings['bitDepth'] },
    { bitDepth: 64 as AudioSettings['bitDepth'] },
]

export const compileAscCode = async (
    code: Code,
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
    const { error, binary, stderr } = await asc.compileString(code, options)
    if (error) {
        throw new Error(stderr.toString())
    }
    return binary
}

export const wasmBufferToRawModule = async (
    buffer: ArrayBuffer,
    imports: any = {}
): Promise<RawModule> => {
    const wasmInstance = await instantiateWasmModule(buffer, imports)
    return wasmInstance.exports as any
}

export const ascCodeToRawModule = async <M extends RawModule>(
    code: Code,
    bitDepth: AudioSettings['bitDepth'],
    imports: any = {}
): Promise<M> => {
    const buffer = await compileAscCode(code, bitDepth)
    const wasmInstance = await instantiateWasmModule(buffer, imports)
    return wasmInstance.exports as unknown as M
}
