import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { AudioSettings, Code } from '../../types'
import { compileWasmModule } from '../test-helpers'
import { makeCompilation } from '../../test-helpers'
import { instantiateWasmModule } from '../wasm-helpers'
import { AssemblyScriptWasmExports, AssemblyScriptWasmImports } from '../types'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

export const getWasmExports = async (
    code: Code,
    wasmImports: AssemblyScriptWasmImports
) => {
    const buffer = await compileWasmModule(code)
    const wasmInstance = await instantiateWasmModule(buffer, {
        input: { ...wasmImports },
    })
    return wasmInstance.exports
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
    const floatArrayType = bitDepth === 64 ? Float64Array : Float32Array
    called.set('i_fs_readSoundFile', [])
    called.set('i_fs_writeSoundFile', [])
    called.set('i_fs_openSoundReadStream', [])
    called.set('i_fs_closeSoundStream', [])
    called.set('i_fs_openSoundWriteStream', [])
    called.set('i_fs_sendSoundStreamData', [])
    const wasmExports = (await getWasmExports(code, {
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
    })) as TestAssemblyScriptWasmExports<ExportsKeys>
    return {
        wasmExports,
        floatArrayType,
        called,
    }
}
