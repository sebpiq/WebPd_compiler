import assert from "assert"
import { lowerTypedArray } from "./tarray-bindings"
import { getAscCode, getWasmExports } from "./test-helpers"

// TODO : test with 32 bits

describe('tarray-bindings', () => {
    const TARRAY_ASC_CODE = getAscCode('tarray.asc')

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
})