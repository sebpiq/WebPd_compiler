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
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(true)

                    // Resolve the event before scheduling anything
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_booleansEqual(skeduler.events.has('some_event'), false)
                    assert_booleansEqual(skeduler.eventLog.has('some_event'), true)

                    // Schedule a wait which should be resolved imediately
                    const skedId = ${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(1234))
                    assert_integersEqual(skedId, ${globals.sked!.ID_NULL!})
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 1234)
                `,
            },

            {
                description:
                    'wait / emit > should call waits callbacks when resolving %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(true)

                    // Schedule a few waits
                    ${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(123))
                    ${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(456))
                    ${globals.sked!.wait!}(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    ${globals.sked!.emit!}(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait / emit > should not call callbacks again when resolving several times %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(true)
                    ${Var(globals.sked!.Id!, 'skedId', globals.sked!.ID_NULL!)}

                    // Schedule and resolve a few events
                    ${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(123))
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                    
                    // Wait is instantly resolved
                    skedId = ${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(456))
                    assert_integersEqual(skedId, ${globals.sked!.ID_NULL!})
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[1], 456)

                    // Resolve again, callback not called
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                `,
            },

            {
                description: 'wait / emit > should cancel wait %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(true)
                    ${ConstVar(
                        globals.sked!.Id!,
                        'skedId',
                        `${globals.sked!.wait!}(skeduler, 'some_event', () => received.push(123))`,
                    )}
                    ${globals.sked!.cancel!}(skeduler, skedId)
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'wait future / emit > should call waits callbacks when resolving %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)

                    // Schedule a few waits
                    ${globals.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(123))
                    ${globals.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(456))
                    ${globals.sked!.waitFuture!}(skeduler, 'some_other_event', () => received.push(789))
                    assert_integersEqual(received.length, 0)

                    // Resolve the waits
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)
                    ${globals.sked!.emit!}(skeduler, 'some_other_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 789)
                `,
            },

            {
                description:
                    'wait future / emit > should not call callbacks again when resolving several times %s',
                testFunction: ({ globals }) => AnonFunc()`            
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)

                    // Schedule and resolve a few events
                    ${globals.sked!.waitFuture!}(skeduler, 'some_event', () => received.push(123))
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Resolve again
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)
                `,
            },

            {
                description: 'wait future / emit > should cancel wait %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)
                    ${Var(globals.sked!.Id!, 'skedId', `${globals.sked!.waitFuture!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globals.sked!.cancel!}(skeduler, skedId)
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)
                `,
            },

            {
                description:
                    'subscribe / emit > emit should trigger existing listeners %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)

                    // Trigger an event with no listeners
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 0)

                    // Register a listener and emit event
                    ${globals.sked!.subscribe!}(skeduler, 'some_event', () => received.push(123))
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 1)
                    assert_integersEqual(received[0], 123)

                    // Register more listeners and emit event
                    ${globals.sked!.subscribe!}(skeduler, 'some_event', () => received.push(456))
                    ${globals.sked!.subscribe!}(skeduler, 'some_event', () => received.push(789))
                    ${globals.sked!.subscribe!}(skeduler, 'some_event', () => received.push(666))
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 5)
                    assert_integersEqual(received[1], 123)
                    assert_integersEqual(received[2], 456)
                    assert_integersEqual(received[3], 789)
                    assert_integersEqual(received[4], 666)
                `,
            },

            {
                description: 'subscribe / emit > should cancel listeners %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)

                    // Register a couple of listeners and emit
                    ${ConstVar(globals.sked!.Id!, 'skedId', `${globals.sked!.subscribe!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globals.sked!.subscribe!}(skeduler, 'some_event', () => received.push(456))
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 2)
                    assert_integersEqual(received[0], 123)
                    assert_integersEqual(received[1], 456)

                    // Cancel a listener and emit again
                    ${globals.sked!.cancel!}(skeduler, skedId)
                    ${globals.sked!.emit!}(skeduler, 'some_event')
                    assert_integersEqual(received.length, 3)
                    assert_integersEqual(received[2], 456)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener that is already cancelled %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)
                    ${ConstVar(globals.sked!.Id!, 'skedId', `${globals.sked!.subscribe!}(
                        skeduler, 
                        'some_event', 
                        () => received.push(123)
                    )`)}
                    ${globals.sked!.cancel!}(skeduler, skedId)
                    ${globals.sked!.cancel!}(skeduler, skedId)
                    ${globals.sked!.cancel!}(skeduler, skedId)
                `,
            },

            {
                description:
                    'cancel > should not throw when cancelling an listener with id NULL %s',
                testFunction: ({ globals }) => AnonFunc()`
                    initializeTests()
                    const skeduler = ${globals.sked!.create!}(false)
                    ${globals.sked!.cancel!}(skeduler, ${globals.sked!.ID_NULL!})
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
