import { VariableName } from '../../ast/types'
import { EngineMetadata } from '../../run/types'
import { liftString } from '../../stdlib/core/bindings-assemblyscript'
import { RawEngine } from './types'
import { instantiateWasmModule } from './wasm-helpers'

export const readMetadata = async (
    wasmBuffer: ArrayBuffer
): Promise<EngineMetadata> => {
    // In order to read metadata, we need to introspect the module to get the imports
    const inputImports: {
        [listenerName: VariableName]: () => void
    } = {}
    const wasmModule = WebAssembly.Module.imports(
        new WebAssembly.Module(wasmBuffer)
    )

    // Then we generate dummy functions to be able to instantiate the module
    wasmModule
        .filter(
            (imprt) => imprt.module === 'input' && imprt.kind === 'function'
        )
        .forEach((imprt) => (inputImports[imprt.name] = () => undefined))
    const wasmInstance = await instantiateWasmModule(wasmBuffer, {
        input: inputImports,
    })

    // Finally, once the module instantiated, we read the metadata
    const rawModule = wasmInstance.exports as unknown as RawEngine
    const stringPointer = rawModule.metadata.valueOf()
    const metadataJSON = liftString(rawModule, stringPointer)
    return JSON.parse(metadataJSON)
}
