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
import { Sequence, ConstVar, Func, Var, AnonFunc } from '../ast/declare'
import { runTestSuite } from '../test-helpers'
import { core } from './core'
import { sked } from './sked'

describe('sked', () => {
    runTestSuite(
        [
            {
                description:
                    'wait / emit > should not have to wait if event already resolved %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(true)

                    // Resolve the event before scheduling anything
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_booleansEqual(skeduler.events.has('some_event'), false)
                    assert_booleansEqual(skeduler.eventLog.has('some_event'), true)

                    // Schedule a wait which should be resolved imediately
                    const skedId = ${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(1234))
                    assert_integersEqual(skedId, ${globalCode.sked!.ID_NULL!})
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 1234)
                `,
            },

            {
                description:
                    'wait / emit > should call waits callbacks when resolving %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(true)

                    // Schedule a few waits
                    ${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(123))
                    ${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(456))
                    ${globalCode.sked!.wait!}(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    ${globalCode.sked!.emit!}(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait / emit > should not call callbacks again when resolving several times %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(true)
                    ${Var(globalCode.sked!.Id!, 'skedId', globalCode.sked!.ID_NULL!)}

                    // Schedule and resolve a few events
                    ${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(123))
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                    
                    // Wait is instantly resolved
                    skedId = ${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(456))
                    assert_integersEqual(skedId, ${globalCode.sked!.ID_NULL!})
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[1], 456)

                    // Resolve again, callback not called
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                `,
            },

            {
                description: 'wait / emit > should cancel wait %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(true)
                    ${ConstVar(
                        globalCode.sked!.Id!,
                        'skedId',
                        `${globalCode.sked!.wait!}(skeduler, 'some_event', () => received.push(123))`,
                    )}
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'wait future / emit > should call waits callbacks when resolving %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)

                    // Schedule a few waits
                    ${globalCode.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(123))
                    ${globalCode.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(456))
                    ${globalCode.sked!.waitFuture!}(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)
                    ${globalCode.sked!.emit!}(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait future / emit > should not call callbacks again when resolving several times %s',
                testFunction: ({ globalCode }) => AnonFunc()`            
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)

                    // Schedule and resolve a few events
                    ${globalCode.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(123))
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Resolve again
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                `,
            },

            {
                description: 'wait future / emit > should cancel wait %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)
                    ${Var(globalCode.sked!.Id!, 'skedId', `${globalCode.sked!.waitFuture!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'subscribe / emit > emit should trigger existing listeners %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)

                    // Trigger an event with no listeners
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)

                    // Register a listener and emit event
                    ${globalCode.sked!.subscribe!}(skeduler, 'some_event', () => received.push(123))
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Register more listeners and emit event
                    ${globalCode.sked!.subscribe!}(skeduler, 'some_event', () => received.push(456))
                    ${globalCode.sked!.subscribe!}(skeduler, 'some_event', () => received.push(789))
                    ${globalCode.sked!.subscribe!}(skeduler, 'some_event', () => received.push(666))
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 5)
                    assert_integersEqual(received[1], 123)
                    assert_integersEqual(received[2], 456)
                    assert_integersEqual(received[3], 789)
                    assert_integersEqual(received[4], 666)
                `,
            },

            {
                description: 'subscribe / emit > should cancel listeners %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)

                    // Register a couple of listeners and emit
                    ${ConstVar(globalCode.sked!.Id!, 'skedId', `${globalCode.sked!.subscribe!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globalCode.sked!.subscribe!}(skeduler, 'some_event', () => received.push(456))
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    // Cancel a listener and emit again
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                    ${globalCode.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 456)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener that is already cancelled %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)
                    ${ConstVar(globalCode.sked!.Id!, 'skedId', `${globalCode.sked!.subscribe!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                    ${globalCode.sked!.cancel!}(skeduler, skedId)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener with id NULL %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globalCode.sked!.create!}(false)
                    ${globalCode.sked!.cancel!}(skeduler, ${globalCode.sked!.ID_NULL!})
                `,
            },
        ],
        [
            core,
            sked,
            {
                namespace: '_',
                code: () => Sequence([
                    Var('Array<Int>', 'received', '[]'),
                    Func('initializeTests')`
                        received = []
                    `,
                ])
            },
        ]
    )
})
