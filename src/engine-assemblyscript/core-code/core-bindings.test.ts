import assert from 'assert'
import { AudioSettings } from '../../types'
import { lowerFloatArray, lowerListOfFloatArrays, readListOfFloatArrays, readTypedArray } from './core-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    replacePlaceholdersForTesting,
    TEST_PARAMETERS,
} from './test-helpers'

describe('core-bindings', () => {
    const getBaseTestCode = (audioSettings: Partial<AudioSettings>) =>
        getAscCode('core.asc', audioSettings) +
        getAscCode('sked.asc', audioSettings) +
        getAscCode('commons.asc', audioSettings) +
        replacePlaceholdersForTesting(
            `
                export {
                    // CORE EXPORTS
                    createFloatArray,
                    x_core_createListOfArrays as core_createListOfArrays,
                    x_core_pushToListOfArrays as core_pushToListOfArrays,
                    x_core_getListOfArraysLength as core_getListOfArraysLength,
                    x_core_getListOfArraysElem as core_getListOfArraysElem,
                }
            `,
            audioSettings
        )

    describe('readTypedArray', () => {
        it.each(TEST_PARAMETERS)(
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

        it.each(TEST_PARAMETERS)(
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

    describe('lowerFloatArray', () => {
        it.each(TEST_PARAMETERS)(
            'should lower typed array to wasm module %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({bitDepth}) + `
                export function testReadArrayElem (array: FloatArray, index: Int): Float {
                    return array[index]
                }
                export function testReadArrayLength (array: FloatArray): Int {
                    return array.length
                }
            `

                const exports = {
                    testReadArrayElem: 1,
                    testReadArrayLength: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const { arrayPointer, array } = lowerFloatArray(
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

                // Test that shares the same memory space
                array[1] = 666
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arrayPointer, 1),
                    666
                )
            }
        )
    })

    describe('lowerListOfFloatArrays', () => {
        it.each(TEST_PARAMETERS)(
            'should lower a list of typed arrays %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({bitDepth}) + `
                export function testReadArraysLength (arrays: FloatArray[], index: Int): f64 {
                    return arrays.length
                }
                export function testReadArrayElem (arrays: FloatArray[], arrIndex: Int, index: Int): f64 {
                    return arrays[arrIndex][index]
                }
                export function testReadArrayLength (arrays: FloatArray[], arrIndex: Int): Int {
                    return arrays[arrIndex].length
                }
            `

                const exports = {
                    testReadArraysLength: 1,
                    testReadArrayElem: 1,
                    testReadArrayLength: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const arraysPointer = lowerListOfFloatArrays(
                    wasmExports,
                    bitDepth,
                    [
                        new Float64Array([111, 222, 333]),
                        new Float32Array([444, 555, 666]),
                        [777, 888],
                        [999],
                    ]
                )
                assert.strictEqual(
                    wasmExports.testReadArraysLength(arraysPointer),
                    4
                )

                assert.strictEqual(
                    wasmExports.testReadArrayLength(arraysPointer, 0),
                    3
                )
                assert.strictEqual(
                    wasmExports.testReadArrayLength(arraysPointer, 1),
                    3
                )
                assert.strictEqual(
                    wasmExports.testReadArrayLength(arraysPointer, 2),
                    2
                )
                assert.strictEqual(
                    wasmExports.testReadArrayLength(arraysPointer, 3),
                    1
                )

                assert.strictEqual(
                    wasmExports.testReadArrayElem(arraysPointer, 0, 0),
                    111
                )
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arraysPointer, 0, 1),
                    222
                )
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arraysPointer, 0, 2),
                    333
                )

                assert.strictEqual(
                    wasmExports.testReadArrayElem(arraysPointer, 2, 0),
                    777
                )
                assert.strictEqual(
                    wasmExports.testReadArrayElem(arraysPointer, 2, 1),
                    888
                )
            }
        )
    })

    describe('readListOfFloatArrays', () => {
        it.each(TEST_PARAMETERS)(
            'should lower a list of typed arrays %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({bitDepth}) + replacePlaceholdersForTesting(`
                const arrays: FloatArray[] = [
                    createFloatArray(3),
                    createFloatArray(3),
                ]
                arrays[0][0] = 11
                arrays[0][1] = 22
                arrays[0][2] = 33
                arrays[1][0] = 44
                arrays[1][1] = 55
                arrays[1][2] = 66
                export function testGetListOfArrays(): FloatArray[] {
                    return arrays
                }
            `, {bitDepth})

                const exports = {
                    testGetListOfArrays: 1,
                }

                const { wasmExports, floatArrayType } =
                    await initializeCoreCodeTest({ code, bitDepth, exports })

                const arraysPointer = wasmExports.testGetListOfArrays()
                const arrays = readListOfFloatArrays(
                    wasmExports,
                    bitDepth,
                    arraysPointer
                )
                assert.deepStrictEqual(arrays, [
                    new floatArrayType([11, 22, 33]),
                    new floatArrayType([44, 55, 66]),
                ])
            }
        )

        it.each(TEST_PARAMETERS)(
            'should share the same memory space %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({bitDepth}) + replacePlaceholdersForTesting(`
                const arrays: FloatArray[] = [
                    createFloatArray(3),
                    createFloatArray(3),
                ]
                arrays[0][0] = 11
                arrays[0][1] = 22
                arrays[0][2] = 33
                arrays[1][0] = 44
                arrays[1][1] = 55
                arrays[1][2] = 66

                export function testGetListOfArrays(): FloatArray[] {
                    return arrays
                }
                export function testReadSomeValue(): \${Float} {
                    return arrays[1][1]
                }
            `, {bitDepth})

                const exports = {
                    testGetListOfArrays: 1,
                    testReadSomeValue: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const arraysPointer = wasmExports.testGetListOfArrays()
                const arrays = readListOfFloatArrays(
                    wasmExports,
                    bitDepth,
                    arraysPointer
                )
                arrays[1][1] = 88
                assert.deepStrictEqual(wasmExports.testReadSomeValue(), 88)
            }
        )
    })
})
