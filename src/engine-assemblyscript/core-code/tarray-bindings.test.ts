import assert from 'assert'
import { lowerTypedArray } from './tarray-bindings'
import { getAscCode, iterTestAudioSettings } from './test-helpers'

describe('tarray-bindings', () => {
    describe('lowerTypedArray', () => {
        it('should lower typed array to wasm module', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + `
                    export function testReadArrayElem (array: TypedArray, index: i32): f64 {
                        return array[index]
                    }
                    export function testReadArrayLength (array: TypedArray): i32 {
                        return array.length
                    }
                `,
                async (wasmExports, { bitDepth }) => {
                    const arrayPointer = lowerTypedArray(
                        wasmExports,
                        bitDepth,
                        new Float64Array([111, 222, 333])
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayLength(arrayPointer),
                        3
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 0),
                        111
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 1),
                        222
                    )
                    assert.strictEqual(
                        wasmExports.testReadArrayElem(arrayPointer, 2),
                        333
                    )
                }
            )
        })
    })
})
