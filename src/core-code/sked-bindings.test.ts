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
    generateTestBindings,
    getAscCode,
    TEST_PARAMETERS,
} from './test-helpers'
import { AudioSettings } from '../types'

describe('sked-bindings', () => {
    const SKED_ID_NULL = -1

    describe('wait / emit', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedWait: 0,
            testSkedResolveWait: true,
            testCallbackResults: new Float32Array(0),
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedWait (
                    skeduler: Skeduler, 
                    event: string
                ): SkedId {
                    return sked_wait(skeduler, event, callback)
                }

                function testSkedResolveWait (
                    skeduler: Skeduler,
                    event: string, 
                    datum: Float
                ): boolean {
                    DUMMY_EVENT_DATA.set(event, datum)
                    sked_emit(skeduler, event)
                    return (skeduler.requests.has(event) === false || skeduler.requests.get(event).length === 0)
                        && skeduler.eventLog.has(event)
                }

                function testCallbackResults (): FloatArray {
                    return cbCalls.subarray(0, cbCallsCounter)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedWait,
                    testSkedResolveWait,
                    testCallbackResults,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should not have to wait if event already resolved %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Resolve the event before scheduling anything
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 1234)
                )

                // Schedule a wait which should be resolved imediately
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    SKED_ID_NULL
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should call waits callbacks when resolving %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Schedule a few waits
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    1
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    2
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_other_event'),
                    3
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )

                // Resolve the waits
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 5678)
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678])
                )

                assert.ok(
                    bindings.testSkedResolveWait(
                        skeduler,
                        'some_other_event',
                        1234
                    )
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678, 1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should not call callbacks again when resolving several times %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                // Schedule and resolve a few events
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    1
                )
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 666)
                )
                assert.strictEqual(
                    bindings.testSkedWait(skeduler, 'some_event'),
                    SKED_ID_NULL
                )

                // Check the calls recorded and resolve again
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666, 666])
                )
                assert.ok(
                    bindings.testSkedResolveWait(skeduler, 'some_event', 1234)
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666, 666])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should cancel wait %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(true)

                const requestId = bindings.testSkedWait(skeduler, 'some_event')
                bindings.sked_cancel(skeduler, requestId)
                bindings.testSkedResolveWait(skeduler, 'some_event', 666)

                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )
            }
        )
    })

    describe('wait future / emit', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedWaitFuture: 0,
            testSkedResolveWaitFuture: true,
            testCallbackResults: new Float32Array(0),
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedWaitFuture (
                    skeduler: Skeduler, 
                    event: string
                ): SkedId {
                    return sked_wait_future(skeduler, event, callback)
                }

                function testSkedResolveWaitFuture (
                    skeduler: Skeduler,
                    event: string, 
                    datum: Float
                ): boolean {
                    DUMMY_EVENT_DATA.set(event, datum)
                    sked_emit(skeduler, event)
                    return (skeduler.requests.has(event) === false || skeduler.requests.get(event).length === 0)
                }

                function testCallbackResults (): FloatArray {
                    return cbCalls.subarray(0, cbCallsCounter)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedWaitFuture,
                    testSkedResolveWaitFuture,
                    testCallbackResults,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should call waits callbacks when resolving %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Schedule a few waits
                assert.strictEqual(
                    bindings.testSkedWaitFuture(skeduler, 'some_event'),
                    1
                )
                assert.strictEqual(
                    bindings.testSkedWaitFuture(skeduler, 'some_event'),
                    2
                )
                assert.strictEqual(
                    bindings.testSkedWaitFuture(skeduler, 'some_other_event'),
                    3
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )

                // Resolve the waits
                assert.ok(
                    bindings.testSkedResolveWaitFuture(
                        skeduler,
                        'some_event',
                        5678
                    )
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678])
                )

                assert.ok(
                    bindings.testSkedResolveWaitFuture(
                        skeduler,
                        'some_other_event',
                        1234
                    )
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([5678, 5678, 1234])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should not call callbacks again when resolving several times %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Schedule and resolve a few events
                assert.strictEqual(
                    bindings.testSkedWaitFuture(skeduler, 'some_event'),
                    1
                )
                assert.ok(
                    bindings.testSkedResolveWaitFuture(
                        skeduler,
                        'some_event',
                        666
                    )
                )

                // Check the calls recorded and resolve again
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666])
                )
                assert.ok(
                    bindings.testSkedResolveWaitFuture(
                        skeduler,
                        'some_event',
                        1234
                    )
                )
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([666])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should cancel wait %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                const requestId = bindings.testSkedWaitFuture(
                    skeduler,
                    'some_event'
                )
                bindings.sked_cancel(skeduler, requestId)
                bindings.testSkedResolveWaitFuture(skeduler, 'some_event', 666)

                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )
            }
        )
    })

    describe('subscribe / emit', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedListen: 0,
            testSkedTriggerListeners: true,
            testCallbackResults: new Float32Array(0),
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedListen (
                    skeduler: Skeduler,
                    event: string,
                ): SkedId {
                    return sked_subscribe(skeduler, event, callback)
                }

                function testSkedTriggerListeners (
                    skeduler: Skeduler, 
                    event: string, 
                    datum: Float
                ): void {
                    DUMMY_EVENT_DATA.set(event, datum)
                    sked_emit(skeduler, event)
                }

                function testCallbackResults (): FloatArray {
                    return cbCalls.subarray(0, cbCallsCounter)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedListen,
                    testSkedTriggerListeners,
                    testCallbackResults,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should emit existing listeners %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Trigger an event with no listeners
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 666)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([])
                )

                // Register a listener and emit event
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    1
                )
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 1234)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234])
                )

                // Register more listeners and emit event
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    2
                )
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    3
                )
                assert.strictEqual(
                    bindings.testSkedListen(skeduler, 'some_event'),
                    4
                )
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 5678)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 5678, 5678, 5678, 5678])
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should cancel listeners %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)

                // Register a couple of listeners and emit
                const requestId: number = bindings.testSkedListen(
                    skeduler,
                    'some_event'
                )
                bindings.testSkedListen(skeduler, 'some_event')
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 1234)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 1234])
                )

                // Cancel a listener and emit again
                bindings.sked_cancel(skeduler, requestId)
                bindings.testSkedTriggerListeners(skeduler, 'some_event', 5678)
                assert.deepStrictEqual(
                    bindings.testCallbackResults(),
                    new floatArrayType([1234, 1234, 5678])
                )
            }
        )
    })

    describe('cancel', () => {
        const EXPORTED_FUNCTIONS = {
            sked_create: 0,
            sked_cancel: 0,
            testSkedListen: 0,
        }

        const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
            getAscCode('core.asc', bitDepth) +
            getAscCode('sked.asc', bitDepth) +
            `
                const DUMMY_EVENT_DATA: Map<string, Float> = new Map()
                const cbCalls: FloatArray = createFloatArray(20)
                let cbCallsCounter: Int = 0

                function callback (event: string): void {
                    cbCalls[cbCallsCounter] = DUMMY_EVENT_DATA.get(event)
                    cbCallsCounter++
                }

                function testSkedListen (
                    skeduler: Skeduler,
                    event: string,
                ): SkedId {
                    return sked_subscribe(skeduler, event, callback)
                }

                export {
                    sked_create,
                    sked_cancel,

                    // TEST FUNCTIONS
                    testSkedListen,
                }
            `

        it.each(TEST_PARAMETERS)(
            'should not throw when cancelling an listener that is already cancelled %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const skeduler = bindings.sked_create(false)
                const requestId: number = bindings.testSkedListen(
                    skeduler,
                    'some_event'
                )
                bindings.sked_cancel(skeduler, requestId)
                bindings.sked_cancel(skeduler, requestId)
                bindings.sked_cancel(skeduler, requestId)
            }
        )
    })
})
