import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { AudioSettings, Code, FloatArray, Message } from '../../types'
import { compileWasmModule } from '../test-helpers'
import { makeCompilation } from '../../test-helpers'
import { instantiateWasmModule } from '../wasm-helpers'
import {
    AssemblyScriptWasmExports,
    AssemblyScriptWasmImports,
    FloatArrayPointer,
    MessagePointer,
    StringPointer,
} from '../types'
import {
    getFloatArrayType,
    replaceCoreCodePlaceholders,
} from '../../compile-helpers'
import { liftMessage, lowerMessage } from './msg-bindings'
import { liftString, lowerString, readTypedArray } from './core-bindings'
import { mapObject } from '../../functional-helpers'
import { lowerFloatArray } from './farray-bindings'

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
    audioSettings: Partial<AudioSettings>
) => {
    const fullAudioSettings: AudioSettings = {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
        ...audioSettings,
    }
    const code = readFileSync(resolve(__dirname, filename)).toString()
    return replacePlaceholdersForTesting(code, fullAudioSettings)
}

export const replacePlaceholdersForTesting = (
    code: Code,
    audioSettings: Partial<AudioSettings>
) => {
    const { codeVariableNames } = makeCompilation({
        target: 'assemblyscript',
        audioSettings: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
            ...audioSettings,
        },
    })
    return replaceCoreCodePlaceholders(codeVariableNames, code)
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

    return mapObject(
        exportedFunctions,
        (returnSample, funcName) => {
            const _liftReturn = _makeLiftAny(returnSample)
            return (...args: Array<AscTransferrableType>) => {
                const loweredArgs = args.map(_lowerAny)
                return _liftReturn(
                    (wasmExports as any)[funcName](...loweredArgs)
                )
            }
        }
    ) as {
        [FuncName in keyof ExportedFunctions]: (
            ...args: Array<AscTransferrableType>
        ) => ExportedFunctions[FuncName]
    }
}
