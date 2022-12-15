import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from "../../constants"
import { Code } from "../../types"
import { instantiateWasmModule } from "../wasm-bindings"
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from "../constants"
import { compileWasmModule } from "../test-helpers"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const getAscCode = (filename: string) => {
    return readFileSync(resolve(__dirname, filename))
        .toString()
        .replaceAll('${FloatArrayType}', 'Float64Array')
        .replaceAll('${FloatType}', 'f64')
        .replaceAll('${getFloat}', 'getFloat64')
        .replaceAll('${setFloat}', 'setFloat64')
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_FLOAT}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_FLOAT
            ].toString()
        )
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_STRING}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_STRING
            ].toString()
        )
}

export const getWasmExports = async (
    code: Code,
) => {
    const buffer = await compileWasmModule(code)
    const wasmInstance = await instantiateWasmModule(buffer, {})
    return wasmInstance.exports as any
}