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
import { AstRaw, ConstVar, Func, Var } from '../ast/declare'
import { runTestSuite } from '../test-helpers'
import { core } from './core'
import { sked } from './sked'

describe('sked', () => {
    runTestSuite(
        [
            {
                description:
                    'wait / emit > should not have to wait if event already resolved %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(true)

                    // Resolve the event before scheduling anything
                    sked_emit(skeduler, 'some_event')
                    assert_booleansEqual(skeduler.requests.has('some_event'), false)
                    assert_booleansEqual(skeduler.eventLog.has('some_event'), true)

                    // Schedule a wait which should be resolved imediately
                    const skedId = sked_wait(skeduler, 'some_event', () => received.push(1234))
                    assert_integersEqual(skedId, SKED_ID_NULL)
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 1234)
                `,
            },

            {
                description:
                    'wait / emit > should call waits callbacks when resolving %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(true)

                    // Schedule a few waits
                    sked_wait(skeduler, 'some_event', () => received.push(123))
                    sked_wait(skeduler, 'some_event', () => received.push(456))
                    sked_wait(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    sked_emit(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait / emit > should not call callbacks again when resolving several times %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(true)
                    ${Var('SkedId', 'skedId', 'SKED_ID_NULL')}

                    // Schedule and resolve a few events
                    sked_wait(skeduler, 'some_event', () => received.push(123))
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                    
                    // Wait is instantly resolved
                    skedId = sked_wait(skeduler, 'some_event', () => received.push(456))
                    assert_integersEqual(skedId, SKED_ID_NULL)
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[1], 456)

                    // Resolve again, callback not called
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                `,
            },

            {
                description: 'wait / emit > should cancel wait %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(true)
                    ${ConstVar(
                        'SkedId',
                        'skedId',
                        `sked_wait(skeduler, 'some_event', () => received.push(123))`,
                    )}
                    sked_cancel(skeduler, skedId)
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'wait future / emit > should call waits callbacks when resolving %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)

                    // Schedule a few waits
                    sked_wait_future(skeduler, 'some_event', () => received.push(123))
                    sked_wait_future(skeduler, 'some_event', () => received.push(456))
                    sked_wait_future(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)
                    sked_emit(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait future / emit > should not call callbacks again when resolving several times %s',
                testFunction: (declareTestFunction) => declareTestFunction`            
                    initializeTests()
                    const skeduler = sked_create(false)

                    // Schedule and resolve a few events
                    sked_wait_future(skeduler, 'some_event', () => received.push(123))
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Resolve again
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                `,
            },

            {
                description: 'wait future / emit > should cancel wait %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)
                    ${Var('SkedId', 'skedId', `sked_wait_future(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    sked_cancel(skeduler, skedId)
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'subscribe / emit > emit should trigger existing listeners %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)

                    // Trigger an event with no listeners
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)

                    // Register a listener and emit event
                    sked_subscribe(skeduler, 'some_event', () => received.push(123))
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Register more listeners and emit event
                    sked_subscribe(skeduler, 'some_event', () => received.push(456))
                    sked_subscribe(skeduler, 'some_event', () => received.push(789))
                    sked_subscribe(skeduler, 'some_event', () => received.push(666))
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 5)
                    assert_integersEqual(received[1], 123)
                    assert_integersEqual(received[2], 456)
                    assert_integersEqual(received[3], 789)
                    assert_integersEqual(received[4], 666)
                `,
            },

            {
                description: 'subscribe / emit > should cancel listeners %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)

                    // Register a couple of listeners and emit
                    ${ConstVar('SkedId', 'skedId', `sked_subscribe(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    sked_subscribe(skeduler, 'some_event', () => received.push(456))
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    // Cancel a listener and emit again
                    sked_cancel(skeduler, skedId)
                    sked_emit(skeduler, 'some_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 456)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener that is already cancelled %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)
                    ${ConstVar('SkedId', 'skedId', `sked_subscribe(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    sked_cancel(skeduler, skedId)
                    sked_cancel(skeduler, skedId)
                    sked_cancel(skeduler, skedId)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener with id NULL %s',
                testFunction: (declareTestFunction) => declareTestFunction`
                    initializeTests()
                    const skeduler = sked_create(false)
                    sked_cancel(skeduler, SKED_ID_NULL)
                `,
            },
        ],
        [
            core.codeGenerator,
            sked,
            () => AstRaw([
                Var('Array<Int>', 'received', '[]'),
                Func('initializeTests', [], 'void')`received = []`,
            ]),
        ]
    )
})
