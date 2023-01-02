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

export const getAscCode = (filename: string, audioSettings: Partial<AudioSettings>) => {
    const fullAudioSettings: AudioSettings = {
        bitDepth: 32,
        channelCount: {in: 2, out: 2},
        ...audioSettings
    }
    const code = readFileSync(resolve(__dirname, filename)).toString()
    return replacePlaceholdersForTesting(code, fullAudioSettings)
}

export const replacePlaceholdersForTesting = (
    code: Code,
    audioSettings: Partial<AudioSettings>
) => {
    const { engineVariableNames } = makeCompilation({
        target: 'assemblyscript',
        audioSettings: {channelCount: {in: 2, out: 2}, bitDepth: 32, ...audioSettings},
    })
    return replaceCoreCodePlaceholders(engineVariableNames, code)
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

type TestExportsKeys = {[name: string]: any}

type TestAssemblyScriptWasmExports<ExportsKeys> = AssemblyScriptWasmExports & {
    [Property in keyof ExportsKeys]: any;
}

interface CoreCodeTestSettings<ExportsKeys extends TestExportsKeys> {
    code: Code,
    exports?: ExportsKeys
    bitDepth: AudioSettings['bitDepth'],
}

export const initializeCoreCodeTest = async <ExportsKeys extends TestExportsKeys>(
    { code, bitDepth }: CoreCodeTestSettings<ExportsKeys>,
) => {
    const called = new Map<keyof AssemblyScriptWasmImports, Array<any>>()
    const floatArrayType =
        bitDepth === 64 ? Float64Array : Float32Array
    called.set('fs_requestReadSoundFile', [])
    called.set('fs_requestWriteSoundFile', [])
    called.set('fs_requestReadSoundStream', [])
    called.set('fs_requestCloseSoundStream', [])
    const wasmExports = await getWasmExports(code, {
        fs_requestReadSoundFile: (...args: any) =>
            called.get('fs_requestReadSoundFile').push(args),
        fs_requestWriteSoundFile: (...args: any) =>
            called.get('fs_requestWriteSoundFile').push(args),
        fs_requestReadSoundStream: (...args: any) =>
            called.get('fs_requestReadSoundStream').push(args),
        fs_requestCloseSoundStream: (...args: any) =>
            called.get('fs_requestCloseSoundStream').push(args),
    }) as TestAssemblyScriptWasmExports<ExportsKeys>
    return {
        wasmExports,
        floatArrayType,
        called
    }
}
