import assert from 'assert'
import { AudioSettings } from '../../types'
import { readTypedArray } from './core-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    TEST_PARAMETERS,
} from './test-helpers'

describe('commons-bindings', () => {
    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
        getAscCode('core.asc', bitDepth) +
        getAscCode('sked.asc', bitDepth) +
        getAscCode('commons.asc', bitDepth) +
        `
            export {
                // CORE EXPORTS
                createFloatArray,
                x_core_createListOfArrays as core_createListOfArrays,
                x_core_pushToListOfArrays as core_pushToListOfArrays,
                x_core_getListOfArraysLength as core_getListOfArraysLength,
                x_core_getListOfArraysElem as core_getListOfArraysElem,
            }
        `

    describe('arrays', () => {
        describe('commons_setArray', () => {
            it.each(TEST_PARAMETERS)(
                'should set the array and notifiy the subscribers hooks %s',
                async ({ bitDepth }) => {
                    // prettier-ignore
                    const code = getBaseTestCode(bitDepth) + `
                    let callbackCalled: Int = 0
                    const subscription: SkedId = commons_subscribeArrayChanges('array1', (): void => {
                        callbackCalled++
                    })
    
                    export function testSetArray (): void {
                        const array = createFloatArray(3)
                        array[0] = 11
                        array[1] = 12
                        array[2] = 13
                        commons_setArray('array1', array)
                    }
    
                    export function testGetArray (): FloatArray {
                        return commons_getArray('array1')
                    }
    
                    export function testUnsubscribe (): void {
                        commons_cancelArrayChangesSubscription(subscription)
                    }
    
                    export function testCallbackCalled (): Int {
                        return callbackCalled
                    }
                `

                    const exports = {
                        testSetArray: 1,
                        testCallbackCalled: 1,
                        testGetArray: 1,
                        testUnsubscribe: 1,
                    }

                    const { wasmExports, floatArrayType } =
                        await initializeCoreCodeTest({
                            code,
                            bitDepth,
                            exports,
                        })

                    wasmExports.testSetArray()
                    assert.strictEqual(wasmExports.testCallbackCalled(), 1)
                    wasmExports.testSetArray()
                    assert.strictEqual(wasmExports.testCallbackCalled(), 2)
                    wasmExports.testUnsubscribe()
                    assert.strictEqual(wasmExports.testCallbackCalled(), 2)

                    const array = readTypedArray(
                        wasmExports,
                        floatArrayType,
                        wasmExports.testGetArray()
                    )
                    assert.deepStrictEqual(
                        array,
                        new floatArrayType([11, 12, 13])
                    )
                }
            )
        })
    })
})
