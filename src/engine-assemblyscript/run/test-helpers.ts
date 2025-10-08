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

import { AudioSettings } from '../../compile/types'
import { Code } from '../../ast/types'
import { instantiateWasmModule } from './wasm-helpers'

export const TEST_PARAMETERS = [
    // { bitDepth: 32 as AudioSettings['bitDepth'] },
    { bitDepth: 64 as AudioSettings['bitDepth'] },
]

let ASC: any = null

/** 
 * This function sets the assemblyscript compiler so that test helpers can use it. 
 * We don't want to bundle assemblyscript because WebPd_compiler is only supposed
 * to generate code, not compile it. Also, assemblyscript is quite heavy and causes
 * problems with bundling. Therefore we leave it to the consumer to load it themselves.
 */
export const setAsc = (asc: any) => ASC = asc

export const compileAssemblyscript = async (
    code: Code,
    bitDepth: AudioSettings['bitDepth']
): Promise<ArrayBuffer> => {
    if (!ASC) {
        throw new Error('Assemblyscript compiler not set. Please call setAsc(asc) first.')
    }
    const options: any = {
        optimizeLevel: 3,
        runtime: 'incremental',
        exportRuntime: true,
    }
    if (bitDepth === 32) {
        options.use = ['Math=NativeMathf']
    }
    const { error, binary, stderr } = await ASC.compileString(code, options)
    if (error) {
        throw new Error(stderr.toString())
    }
    return binary
}

export const wasmBufferToRawModule = async (
    buffer: ArrayBuffer,
    imports: any = {}
): Promise<object> => {
    const wasmInstance = await instantiateWasmModule(buffer, imports)
    return wasmInstance.exports as any
}

export const ascCodeToRawModule = async <M extends object = object>(
    code: Code,
    bitDepth: AudioSettings['bitDepth'],
    imports: any = {}
): Promise<M> => {
    const buffer = await compileAssemblyscript(code, bitDepth)
    const wasmInstance = await instantiateWasmModule(buffer, imports)
    return wasmInstance.exports as unknown as M
}
