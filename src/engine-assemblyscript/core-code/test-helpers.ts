import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { AudioSettings, Code } from '../../types'
import { compileWasmModule } from '../test-helpers'
import { replacePlaceholders } from '.'
import { makeCompilation } from '../../test-helpers'
import { instantiateWasmModule } from '../wasm-helpers'
import {
    AssemblyScriptWasmImports,
    InternalPointer,
    StringPointer,
} from '../types'
import { FloatArrayTypeConstructor } from './tarray-bindings'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_AUDIO_SETTINGS_LIST: Array<AudioSettings> = [
    { bitDepth: 32, channelCount: { in: 2, out: 2 } },
    { bitDepth: 64, channelCount: { in: 2, out: 2 } },
]

type CallbacksCalls = Map<keyof AssemblyScriptWasmImports, Array<any>>

export const getAscCode = (filename: string, audioSettings: AudioSettings) => {
    const code = readFileSync(resolve(__dirname, filename)).toString()
    return replacePlaceholdersForTesting(code, audioSettings)
}

export const replacePlaceholdersForTesting = (
    code: Code,
    audioSettings: AudioSettings
) => {
    const { engineVariableNames } = makeCompilation({
        target: 'assemblyscript',
        audioSettings,
    })
    return replacePlaceholders(engineVariableNames, code)
}

export const getWasmExports = async (
    code: Code,
    wasmImports: AssemblyScriptWasmImports
) => {
    const buffer = await compileWasmModule(code)
    const wasmInstance = await instantiateWasmModule(buffer, {
        input: { ...wasmImports },
    })
    return wasmInstance.exports as any
}

export const iterTestAudioSettings = async (
    codeGenFunc: (audioSettings: AudioSettings) => Code,
    testFunc: (
        wasmExports: any,
        audioSettings: AudioSettings & {
            floatArrayType: FloatArrayTypeConstructor
        },
        called: CallbacksCalls
    ) => Promise<void>,
    audioSettingsList: Array<AudioSettings> = DEFAULT_AUDIO_SETTINGS_LIST
) => {
    for (let audioSettings of audioSettingsList) {
        const code = codeGenFunc(audioSettings)
        const called = new Map()
        const floatArrayType =
            audioSettings.bitDepth === 64 ? Float64Array : Float32Array
        called.set('fs_readSoundListener', [])
        called.set('fs_writeSoundListener', [])
        const wasmExports = await getWasmExports(code, {
            fs_readSoundListener: (url: StringPointer, info: any) => {
                called.get('fs_readSoundListener').push([url, info])
            },
            fs_writeSoundListener: (
                url: StringPointer,
                listOfArrays: InternalPointer,
                info: any
            ) => {
                called
                    .get('fs_writeSoundListener')
                    .push([url, listOfArrays, info])
            },
        })
        await testFunc(
            wasmExports,
            { ...audioSettings, floatArrayType },
            called
        )
    }
}
