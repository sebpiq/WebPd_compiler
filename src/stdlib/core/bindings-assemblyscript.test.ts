/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
import assert from 'assert'
import {
    CoreRawModuleWithDependencies,
    lowerFloatArray,
    lowerListOfFloatArrays,
    readListOfFloatArrays,
    readTypedArray,
} from './bindings-assemblyscript'
import { AudioSettings } from '../../compile/types'
import {
    TEST_PARAMETERS,
    ascCodeToRawModule,
    setAsc,
} from '../../engine-assemblyscript/run/test-helpers'
import { getFloatArrayType } from '../../run/run-helpers'
import { core } from './core'
import {
    FloatArrayPointer,
    InternalPointer,
} from '../../engine-assemblyscript/run/types'
import { Sequence } from '../../ast/declare'
import macros from '../../engine-assemblyscript/compile/macros'
import render from '../../compile/render'
import { makePrecompilation } from '../../compile/test-helpers'
import { Code } from '../../ast/types'
import { instantiateAndDedupeDependencies } from '../../compile/precompile/dependencies'
import { CoreNamespaceAll } from './types'
import { proxyWithEngineNameMapping } from '../../run/run-helpers'
import asc from 'assemblyscript/asc'

describe('core-bindings', () => {
    interface CoreTestRawModule {
        testGetMyArray: () => FloatArrayPointer
        testCreateNewArray(size: number): FloatArrayPointer
        testReadArrayElem: (array: FloatArrayPointer, index: number) => number
        testReadArrayLength: (array: FloatArrayPointer) => number
        testGetListOfArrays: () => InternalPointer
        testReadFloatArraysLength: (arrays: InternalPointer) => number
        testReadFloatArraysArrayElem: (
            arrays: InternalPointer,
            arrIndex: number,
            index: number
        ) => number
        testReadFloatArraysArrayLength: (
            arrays: InternalPointer,
            arrIndex: number
        ) => number
        testReadSomeValueFromFloatArrays: () => number
    }

    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) => {
        const precompilation = makePrecompilation({
            settings: {
                target: 'assemblyscript',
                audio: { bitDepth, channelCount: { in: 2, out: 2 } },
            },
        })
        const assignerNs = precompilation.variableNamesAssigner.globals
            .core as CoreNamespaceAll
        const localContext = { ns: assignerNs }
        const globals = precompilation.variableNamesReadOnly.globals
        const settings = precompilation.settings
        return render(
            macros,
            Sequence([
                core.code(localContext, globals, settings),
                core.exports!(localContext, globals, settings).map(
                    (name) => `export { ${name} }`
                ),
            ])
        )
    }

    const compileRawModule = async (
        code: Code,
        bitDepth: AudioSettings['bitDepth']
    ) => {
        const rawModule = await ascCodeToRawModule<CoreTestRawModule>(
            code,
            bitDepth
        )
        const precompilation = makePrecompilation({
            settings: {
                target: 'assemblyscript',
            },
        })
        const globals = precompilation.variableNamesReadOnly.globals
        const settings = precompilation.settings
        // We instantiate the code to make sure all names are assigned
        instantiateAndDedupeDependencies(
            [core],
            precompilation.variableNamesAssigner,
            globals,
            settings
        )
        return proxyWithEngineNameMapping(
            rawModule,
            precompilation.variableNamesIndex
        ) as CoreRawModuleWithDependencies & CoreTestRawModule
    }

    beforeAll(async () => {
        setAsc(asc)
    })

    describe('readTypedArray', () => {
        it.each(TEST_PARAMETERS)(
            'should read existing typed array from wasm module %s',
            async ({ bitDepth }) => {
                // prettier-ignore
                const rawModule = await compileRawModule(
                    getBaseTestCode(bitDepth) + `
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
                    `, bitDepth)

                const arrayPointer = rawModule.testGetMyArray()
                const myArray = readTypedArray(
                    rawModule,
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
                    rawModule.testReadArrayElem(arrayPointer, 0),
                    111
                )
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 1),
                    456
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should read dynamically created typed array from wasm module %s',
            async ({ bitDepth }) => {
                const rawModule = await compileRawModule(
                    getBaseTestCode(bitDepth) +
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
                    `,
                    bitDepth
                )

                const arrayPointer = rawModule.testCreateNewArray(3)
                const myArray = readTypedArray(
                    rawModule,
                    Float64Array,
                    arrayPointer
                )
                assert.deepStrictEqual(myArray, new Float64Array([23, 45, 67]))

                // Arrays share memory space, so modifications should happen in wasm memory too
                myArray[0] = 111
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 0),
                    111
                )
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 1),
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
                const rawModule = await compileRawModule(getBaseTestCode(bitDepth) + `
                    export function testReadArrayElem (array: FloatArray, index: Int): Float {
                        return array[index]
                    }
                    export function testReadArrayLength (array: FloatArray): Int {
                        return array.length
                    }
                `, bitDepth)

                const { arrayPointer, array } = lowerFloatArray(
                    rawModule,
                    bitDepth,
                    new Float64Array([111, 222, 333])
                )
                assert.strictEqual(
                    rawModule.testReadArrayLength(arrayPointer),
                    3
                )
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 0),
                    111
                )
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 1),
                    222
                )
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 2),
                    333
                )

                // Test that shares the same memory space
                array[1] = 666
                assert.strictEqual(
                    rawModule.testReadArrayElem(arrayPointer, 1),
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
                const rawModule = await compileRawModule(getBaseTestCode(bitDepth) + `
                    export function testReadFloatArraysLength (arrays: FloatArray[]): f64 {
                        return arrays.length
                    }
                    export function testReadFloatArraysArrayElem (arrays: FloatArray[], arrIndex: Int, index: Int): f64 {
                        return arrays[arrIndex][index]
                    }
                    export function testReadFloatArraysArrayLength (arrays: FloatArray[], arrIndex: Int): Int {
                        return arrays[arrIndex].length
                    }
                `, bitDepth)

                const arraysPointer = lowerListOfFloatArrays(
                    rawModule,
                    bitDepth,
                    [
                        new Float64Array([111, 222, 333]),
                        new Float32Array([444, 555, 666]),
                        [777, 888],
                        [999],
                    ]
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysLength(arraysPointer),
                    4
                )

                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayLength(arraysPointer, 0),
                    3
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayLength(arraysPointer, 1),
                    3
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayLength(arraysPointer, 2),
                    2
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayLength(arraysPointer, 3),
                    1
                )

                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayElem(arraysPointer, 0, 0),
                    111
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayElem(arraysPointer, 0, 1),
                    222
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayElem(arraysPointer, 0, 2),
                    333
                )

                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayElem(arraysPointer, 2, 0),
                    777
                )
                assert.strictEqual(
                    rawModule.testReadFloatArraysArrayElem(arraysPointer, 2, 1),
                    888
                )
            }
        )
    })

    describe('readListOfFloatArrays', () => {
        it.each(TEST_PARAMETERS)(
            'should lower a list of typed arrays %s',
            async ({ bitDepth }) => {
                const floatArrayType = getFloatArrayType(bitDepth)
                // prettier-ignore
                const rawModule = await compileRawModule(getBaseTestCode(bitDepth) + `
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
                `, bitDepth)

                const arraysPointer = rawModule.testGetListOfArrays()
                const arrays = readListOfFloatArrays(
                    rawModule,
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
                const rawModule = await compileRawModule(getBaseTestCode(bitDepth) + `
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
                    export function testReadSomeValueFromFloatArrays(): Float {
                        return arrays[1][1]
                    }
                `, bitDepth)

                const arraysPointer = rawModule.testGetListOfArrays()
                const arrays = readListOfFloatArrays(
                    rawModule,
                    bitDepth,
                    arraysPointer
                )
                arrays[1]![1] = 88
                assert.deepStrictEqual(
                    rawModule.testReadSomeValueFromFloatArrays(),
                    88
                )
            }
        )
    })
})
