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

import { liftMessage, lowerMessage } from '../engine-assemblyscript/msg-bindings'
import {
    liftString,
    lowerString,
    readTypedArray,
    lowerFloatArray,
} from '../engine-assemblyscript/core-bindings'
import {
    getFloatArrayType,
} from '../compile-helpers'
import { compileAscCode } from '../engine-assemblyscript/test-helpers'
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
    const buffer = await compileAscCode(code, bitDepth)
    const wasmInstance = await instantiateWasmModule(buffer, {
        input: wasmImports,
    })
    return wasmInstance.exports as unknown as WasmExports
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
