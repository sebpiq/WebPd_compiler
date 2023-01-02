import assert from 'assert'
import { AudioSettings } from '../../types'
import { readTypedArray } from './core-bindings'
import { getAscCode, initializeCoreCodeTest } from './test-helpers'

describe('core-bindings', () => {
    describe('readTypedArray', () => {
        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])(
            'should read existing typed array from wasm module %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getAscCode('core.asc', {bitDepth}) + `
                const myArray: Float64Array = new Float64Array(3)
                myArray[0] = 123
                myArray[1] = 456
                myArray[2] = 789
                export function testGetMyArray(): Float64Array {
                    return myArray
                }
                export function testReadArrayElem (array: Float64Array, index: Int): f64 {
                    return array[index]
                }
                export function testReadArrayLength (array: Float64Array): Int {
                    return array.length
                }
            `

                const exports = {
                    testGetMyArray: 1,
                    testReadArrayElem: 1,
                    testReadArrayLength: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const arrayPointer = wasmExports.testGetMyArray()
                const myArray = readTypedArray(
                    wasmExports,
                    Float64Array,
                    arrayPointer
                )
                assert.deepStrictEqual(
                    myArray,
                    new Float64Array([123, 456, 789])
                )

                // Arrays share memory space, so modifications should happen in wasm memory too
                myArray[0] = 111
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arrayPointer, 0),
                    111
                )
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arrayPointer, 1),
                    456
                )
            }
        )

        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])(
            'should read dynamically created typed array from wasm module %s',
            async ({ bitDepth }) => {
                const code =
                    getAscCode('core.asc', { bitDepth }) +
                    `
                export function testCreateNewArray(size: Int): Float64Array {
                    const array = new Float64Array(size)
                    array[0] = 23
                    array[1] = 45
                    array[2] = 67
                    return array
                }
                export function testReadArrayElem (array: Float64Array, index: Int): f64 {
                    return array[index]
                }
                export function testReadArrayLength (array: Float64Array): Int {
                    return array.length
                }
            `

                const exports = {
                    testCreateNewArray: 1,
                    testReadArrayElem: 1,
                    testReadArrayLength: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const arrayPointer = wasmExports.testCreateNewArray(3)
                const myArray = readTypedArray(
                    wasmExports,
                    Float64Array,
                    arrayPointer
                )
                assert.deepStrictEqual(myArray, new Float64Array([23, 45, 67]))

                // Arrays share memory space, so modifications should happen in wasm memory too
                myArray[0] = 111
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arrayPointer, 0),
                    111
                )
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arrayPointer, 1),
                    45
                )
            }
        )
    })
})
