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
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { liftMessage, lowerMessage } from './msg-bindings'
import {
    liftString,
    lowerString,
    readTypedArray,
    lowerFloatArray,
} from './core-bindings'
import {
    replaceCoreCodePlaceholders,
    getFloatArrayType,
} from '../compile-helpers'
import { compileWasmModule } from '../engine-assemblyscript/test-helpers'
import {
    AssemblyScriptWasmImports,
    AssemblyScriptWasmExports,
    MessagePointer,
    StringPointer,
    FloatArrayPointer,
} from '../engine-assemblyscript/types'
import { instantiateWasmModule } from '../engine-assemblyscript/wasm-helpers'
import { mapObject } from '../functional-helpers'
import { Message, FloatArray, AudioSettings, Code } from '../types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export type AscTransferrableType =
    | string
    | number
    | Message
    | boolean
    | FloatArray

export const TEST_PARAMETERS = [
    { bitDepth: 32 as AudioSettings['bitDepth'], floatArrayType: Float32Array },
    { bitDepth: 64 as AudioSettings['bitDepth'], floatArrayType: Float64Array },
]

export const getAscCode = (
    filename: string,
    bitDepth: AudioSettings['bitDepth']
) => {
    const code = readFileSync(resolve(__dirname, filename)).toString()
    if (filename === 'core.asc') {
        return replaceCoreCodePlaceholders(bitDepth, code)
    } else {
        return code
    }
}

export const getWasmExports = async <WasmExports>(
    code: Code,
    bitDepth: AudioSettings['bitDepth'],
    wasmImports: AssemblyScriptWasmImports = {
        i_fs_readSoundFile: () => undefined,
        i_fs_writeSoundFile: () => undefined,
        i_fs_openSoundReadStream: () => undefined,
        i_fs_openSoundWriteStream: () => undefined,
        i_fs_sendSoundStreamData: () => undefined,
        i_fs_closeSoundStream: () => undefined,
    }
) => {
    const buffer = await compileWasmModule(code, bitDepth)
    const wasmInstance = await instantiateWasmModule(buffer, {
        input: wasmImports,
    })
    return wasmInstance.exports as unknown as WasmExports
}

type TestExportsKeys = { [name: string]: any }

type TestAssemblyScriptWasmExports<ExportsKeys> = AssemblyScriptWasmExports & {
    [Property in keyof ExportsKeys]: any
}

interface CoreCodeTestSettings<ExportsKeys extends TestExportsKeys> {
    code: Code
    exports?: ExportsKeys
    bitDepth: AudioSettings['bitDepth']
}

export const initializeCoreCodeTest = async <
    ExportsKeys extends TestExportsKeys
>({
    code,
    bitDepth,
}: CoreCodeTestSettings<ExportsKeys>) => {
    const called = new Map<keyof AssemblyScriptWasmImports, Array<any>>()
    const floatArrayType = getFloatArrayType(bitDepth)
    called.set('i_fs_readSoundFile', [])
    called.set('i_fs_writeSoundFile', [])
    called.set('i_fs_openSoundReadStream', [])
    called.set('i_fs_closeSoundStream', [])
    called.set('i_fs_openSoundWriteStream', [])
    called.set('i_fs_sendSoundStreamData', [])
    const wasmExports = await getWasmExports<
        TestAssemblyScriptWasmExports<ExportsKeys>
    >(code, bitDepth, {
        i_fs_readSoundFile: (...args: any) =>
            called.get('i_fs_readSoundFile').push(args),
        i_fs_writeSoundFile: (...args: any) =>
            called.get('i_fs_writeSoundFile').push(args),
        i_fs_openSoundReadStream: (...args: any) =>
            called.get('i_fs_openSoundReadStream').push(args),
        i_fs_openSoundWriteStream: (...args: any) =>
            called.get('i_fs_openSoundWriteStream').push(args),
        i_fs_sendSoundStreamData: (...args: any) =>
            called.get('i_fs_sendSoundStreamData').push(args),
        i_fs_closeSoundStream: (...args: any) =>
            called.get('i_fs_closeSoundStream').push(args),
    })
    return {
        wasmExports,
        floatArrayType,
        called,
    }
}

export const generateTestBindings = async <
    ExportedFunctions extends { [functionName: string]: AscTransferrableType }
>(
    code: Code,
    bitDepth: AudioSettings['bitDepth'],
    exportedFunctions: ExportedFunctions
) => {
    const wasmExports = await getWasmExports<AssemblyScriptWasmExports>(
        code,
        bitDepth
    )

    const _lowerAny = (obj: AscTransferrableType) => {
        if (typeof obj === 'string') {
            return lowerString(wasmExports, obj)
        } else if (typeof obj === 'number') {
            return obj
        } else if (typeof obj === 'boolean') {
            return +obj
        } else if (obj instanceof Float32Array || obj instanceof Float64Array) {
            return lowerFloatArray(wasmExports, bitDepth, obj).arrayPointer
        } else if (Array.isArray(obj)) {
            return lowerMessage(wasmExports, obj)
        } else {
            throw new Error(`unsupported type`)
        }
    }

    const _makeLiftAny =
        (liftAs: AscTransferrableType) =>
        (obj: AscTransferrableType | MessagePointer | StringPointer) => {
            if (typeof liftAs === 'string') {
                return liftString(wasmExports, obj as StringPointer)
            } else if (typeof liftAs === 'number') {
                return obj
            } else if (typeof liftAs === 'boolean') {
                return !!obj
            } else if (
                liftAs instanceof Float32Array ||
                liftAs instanceof Float64Array
            ) {
                return readTypedArray(
                    wasmExports,
                    getFloatArrayType(bitDepth),
                    obj as FloatArrayPointer
                )
            } else if (Array.isArray(liftAs)) {
                return liftMessage(wasmExports, obj as MessagePointer)
            } else {
                throw new Error(`unsupported type`)
            }
        }

    return mapObject(exportedFunctions, (returnSample, funcName) => {
        const _liftReturn = _makeLiftAny(returnSample)
        return (...args: Array<AscTransferrableType>) => {
            const loweredArgs = args.map(_lowerAny)
            return _liftReturn((wasmExports as any)[funcName](...loweredArgs))
        }
    }) as {
        [FuncName in keyof ExportedFunctions]: (
            ...args: Array<AscTransferrableType>
        ) => ExportedFunctions[FuncName]
    }
}