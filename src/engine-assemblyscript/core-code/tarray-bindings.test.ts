import assert from 'assert'
import { AudioSettings } from '../../types'
import {
    lowerTypedArray,
    lowerListOfTypedArrays,
    readListOfTypedArrays,
} from './tarray-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    replacePlaceholdersForTesting,
} from './test-helpers'

describe('tarray-bindings', () => {
    const getBaseTestCode = (audioSettings: Partial<AudioSettings>) =>
        getAscCode('core.asc', audioSettings) +
        getAscCode('tarray.asc', audioSettings) +
        replacePlaceholdersForTesting(
            `
                export {
                    x_tarray_createListOfArrays as tarray_createListOfArrays,
                    x_tarray_pushToListOfArrays as tarray_pushToListOfArrays,
                    x_tarray_getListOfArraysLength as tarray_getListOfArraysLength,
                    x_tarray_getListOfArraysElem as tarray_getListOfArraysElem,
                    x_tarray_create as tarray_create,
                }
            `,
            audioSettings
        )

    describe('lowerTypedArray', () => {
        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])(
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

                const { arrayPointer, array } = lowerTypedArray(
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

    describe('lowerListOfTypedArrays', () => {
        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])('should lower a list of typed arrays %s', async ({ bitDepth }) => {
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

            const arraysPointer = lowerListOfTypedArrays(
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
        })
    })

    describe('readListOfTypedArrays', () => {
        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])('should lower a list of typed arrays %s', async ({ bitDepth }) => {
            // prettier-ignore
            const code = getBaseTestCode({bitDepth}) + replacePlaceholdersForTesting(`
                const arrays: FloatArray[] = [
                    new \${FloatArray}(3),
                    new \${FloatArray}(3)
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
            const arrays = readListOfTypedArrays(
                wasmExports,
                bitDepth,
                arraysPointer
            )
            assert.deepStrictEqual(arrays, [
                new floatArrayType([11, 22, 33]),
                new floatArrayType([44, 55, 66]),
            ])
        })

        it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
            { bitDepth: 32 },
            { bitDepth: 64 },
        ])('should share the same memory space %s', async ({ bitDepth }) => {
            // prettier-ignore
            const code = getBaseTestCode({bitDepth}) + replacePlaceholdersForTesting(`
                const arrays: FloatArray[] = [
                    new \${FloatArray}(3),
                    new \${FloatArray}(3)
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
            const arrays = readListOfTypedArrays(
                wasmExports,
                bitDepth,
                arraysPointer
            )
            arrays[1][1] = 88
            assert.deepStrictEqual(wasmExports.testReadSomeValue(), 88)
        })
    })
})
