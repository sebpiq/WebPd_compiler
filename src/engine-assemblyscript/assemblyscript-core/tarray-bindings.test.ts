import assert from "assert"
import { readFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { Code } from "../../types"
import { instantiateWasmModule } from "../assemblyscript-wasm-bindings"
import { compileWasmModule } from "../test-helpers"
import { lowerTypedArray, readTypedArray } from "./tarray-bindings"

// TODO : test with 32 bits
// TODO : move this out of here
// TODO : move getWamsExports out of here
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const getTarrayAscCode = () => {
    return readFileSync(resolve(__dirname, 'tarray.asc'))
        .toString()
        .replaceAll('${FloatArrayType}', 'Float64Array')
        .replaceAll('${FloatType}', 'f64')
        .replaceAll('${getFloat}', 'getFloat64')
        .replaceAll('${setFloat}', 'setFloat64')
}

describe('tarray-bindings', () => {

    const TARRAY_ASC_CODE = getTarrayAscCode()

    const getWasmExports = async (
        code: Code,
    ) => {
        const buffer = await compileWasmModule(code)
        const wasmInstance = await instantiateWasmModule(buffer, {})
        return wasmInstance.exports as any
    }

    describe('lowerTypedArray', () => {
        it('should lower typed array to wasm module', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                TARRAY_ASC_CODE + `
                    export function testReadArrayElem (array: TypedArray, index: i32): f64 {
                        return array[index]
                    }
                    export function testReadArrayLength (array: TypedArray): i32 {
                        return array.length
                    }
                `
            )

            const arrayPointer = lowerTypedArray(wasmExports, 64, new Float64Array([11.1, 22.2, 33.3]))
            assert.strictEqual(wasmExports.testReadArrayLength(arrayPointer), 3)
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 0), 11.1)
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 1), 22.2)
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 2), 33.3)
        })
    })

    describe('readTypedArray', () => {
        it('should read existing typed array from wasm module', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                TARRAY_ASC_CODE + `
                    const myArray: Float64Array = new Float64Array(3)
                    myArray[0] = 123
                    myArray[1] = 456
                    myArray[2] = 789
                    export function testGetMyArray(): Float64Array {
                        return myArray
                    }
                    export function testReadArrayElem (array: TypedArray, index: i32): f64 {
                        return array[index]
                    }
                    export function testReadArrayLength (array: TypedArray): i32 {
                        return array.length
                    }
                `
            )

            const arrayPointer = wasmExports.testGetMyArray()
            const myArray = readTypedArray(wasmExports, Float64Array, arrayPointer)
            assert.deepStrictEqual(myArray, new Float64Array([123, 456, 789]))

            // Arrays share memory space, so modifications should happen in wasm memory too
            myArray[0] = 111
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 0), 111)
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 1), 456)
        })

        it('should read dynamically created typed array from wasm module', async () => {
            const wasmExports = await getWasmExports(
                // prettier-ignore
                TARRAY_ASC_CODE + `
                    export function testReadArrayElem (array: TypedArray, index: i32): f64 {
                        return array[index]
                    }
                    export function testReadArrayLength (array: TypedArray): i32 {
                        return array.length
                    }
                `
            )

            const arrayPointer = lowerTypedArray(wasmExports, 64, new Float64Array([23, 45, 67]))
            const myArray = readTypedArray(wasmExports, Float64Array, arrayPointer)
            assert.deepStrictEqual(myArray, new Float64Array([23, 45, 67]))

            // Arrays share memory space, so modifications should happen in wasm memory too
            myArray[0] = 111
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 0), 111)
            assert.strictEqual(wasmExports.testReadArrayElem(arrayPointer, 1), 45)
        })
    })
})