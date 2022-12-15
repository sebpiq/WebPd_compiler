import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { AudioSettings, Code } from '../../types'
import { instantiateWasmModule } from '../wasm-bindings'
import { compileWasmModule } from '../test-helpers'
import { replacePlaceholders } from '.'
import { makeCompilation } from '../../test-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_AUDIO_SETTINGS_LIST: Array<AudioSettings> = [
    { bitDepth: 32, channelCount: { in: 2, out: 2 } },
    { bitDepth: 64, channelCount: { in: 2, out: 2 } },
]

export const getAscCode = (filename: string, audioSettings: AudioSettings) => {
    const code = readFileSync(resolve(__dirname, filename)).toString()
    const { engineVariableNames } = makeCompilation({
        target: 'assemblyscript',
        audioSettings,
    })
    return replacePlaceholders(engineVariableNames, code)
}

export const getWasmExports = async (code: Code) => {
    const buffer = await compileWasmModule(code)
    const wasmInstance = await instantiateWasmModule(buffer, {})
    return wasmInstance.exports as any
}

export const iterTestAudioSettings = async (
    codeGenFunc: (audioSettings: AudioSettings) => Code,
    testFunc: (wasmExports: any, audioSettings: AudioSettings) => Promise<void>,
    audioSettingsList: Array<AudioSettings> = DEFAULT_AUDIO_SETTINGS_LIST
) => {
    for (let audioSettings of audioSettingsList) {
        const code = codeGenFunc(audioSettings)
        const wasmExports = await getWasmExports(code)
        await testFunc(wasmExports, audioSettings)
    }
}
