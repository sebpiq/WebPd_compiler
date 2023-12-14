import { CompilerTarget } from "../compile/types"
import { readMetadata as readMetadataWasm } from '../engine-assemblyscript/run/engine-lifecycle-bindings'
import { JavaScriptEngineCode } from "../engine-javascript/compile/types"
import { createEngine } from "../engine-javascript/run"
import { EngineMetadata } from "./types"

export const readMetadata = async (
    target: CompilerTarget,
    compiled: ArrayBuffer | JavaScriptEngineCode,
): Promise<EngineMetadata> => {
    switch (target) {
        case 'assemblyscript':
            return readMetadataWasm(compiled as ArrayBuffer)
        case 'javascript':
            return createEngine(compiled as string).metadata
    }
}
