import assert from 'assert'
import { AudioSettings } from '../../types'
import {
    generateTestBindings,
    getAscCode,
    replacePlaceholdersForTesting,
    TEST_PARAMETERS,
} from './test-helpers'

describe('buf-bindings', () => {
    const EXPORTED_FUNCTIONS = {
        testSkedWait: 0,
        testSkedResolve: true,
        testGetAcquiredResources: new Float32Array(0)
    }

    const getBaseTestCode = (audioSettings: Partial<AudioSettings>) =>
        getAscCode('core.asc', audioSettings) +
        getAscCode('farray.asc', audioSettings) +
        getAscCode('sked.asc', audioSettings) +
        replacePlaceholdersForTesting(
            `
                const SKEDULER = sked_create()
                const RESOURCES: Map<string, Float> = new Map()
                const acquiredResources: FloatArray = farray_create(20)
                let acquiredResourcesCounter: Int = 0

                function testSkedWait (event: string): void {
                    sked_wait(SKEDULER, event, (event: string) => {
                        acquiredResources[acquiredResourcesCounter] = RESOURCES.get(event)
                        acquiredResourcesCounter++
                    })
                }

                function testSkedResolve (event: string, resource: Float): boolean {
                    RESOURCES.set(event, resource)
                    sked_resolve(SKEDULER, event)
                    return SKEDULER.waitCallbacks.has(event) === false
                        && SKEDULER.waitStatuses.get(event) === _SKED_WAIT_OVER
                }

                function testGetAcquiredResources (): FloatArray {
                    return acquiredResources.subarray(0, acquiredResourcesCounter)
                }

                export {
                    // TEST FUNCTIONS
                    testSkedWait,
                    testSkedResolve,
                    testGetAcquiredResources,
                }
            `,
            audioSettings
        )

    describe('wait / resolve', () => {
        it.each(TEST_PARAMETERS)(
            'should not have to wait if event already resolved %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode({ bitDepth })
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                assert.ok(bindings.testSkedResolve('some_event', 1234))
                bindings.testSkedWait('some_event')
                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([1234])
                )
                bindings.testSkedWait('some_event')
                bindings.testSkedWait('some_event')
                bindings.testSkedWait('some_event')

                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([1234, 1234, 1234, 1234])
                )

            }
        )

        it.each(TEST_PARAMETERS)(
            'should call waits callbacks when resolving %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode({ bitDepth })
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                bindings.testSkedWait('some_event')
                bindings.testSkedWait('some_event')
                bindings.testSkedWait('some_event')
                bindings.testSkedWait('some_other_event')
                bindings.testSkedWait('some_other_event')

                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([])
                )

                assert.ok(bindings.testSkedResolve('some_event', 5678))
                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([5678, 5678, 5678])
                )

                assert.ok(bindings.testSkedResolve('some_other_event', 1234))
                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([5678, 5678, 5678, 1234, 1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should not call callbacks again when resolving several times %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode({ bitDepth })
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                bindings.testSkedWait('some_event')
                assert.ok(bindings.testSkedResolve('some_event', 666))
                bindings.testSkedWait('some_event')

                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([666, 666])
                )
                assert.ok(bindings.testSkedResolve('some_event', 1234))
                assert.deepStrictEqual(
                    bindings.testGetAcquiredResources(), 
                    new floatArrayType([666, 666])
                )
            }
        )
    })
})
