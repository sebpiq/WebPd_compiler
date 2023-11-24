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
import { AnonFunc, ast, ConstVar, Func, Var } from '../ast/declare'
import { runTestSuite } from '../test-helpers'
import {
    commonsCore,
    commonsArrays,
    commonsWaitEngineConfigure,
    commonsWaitFrame,
} from './commons'
import { core } from './core'
import { sked } from './sked'

describe('commons', () => {
    runTestSuite(
        [
            {
                description:
                    'setArray > should set the array and notifiy the subscribers hooks %s',
                testFunction: () => AnonFunc()`
                    callbackCallCounter = 0

                    ${ConstVar(
                        'SkedId',
                        'subscription',
                        ast`commons_subscribeArrayChanges(
                            'array1', 
                            ${Func('callback')`
                                callbackCallCounter++
                            `}
                        )`
                    )}

                    // First time array is set, subscriber is notified
                    commons_setArray('array1', createFloatArray(5))
                    assert_integersEqual(callbackCallCounter, 1)

                    // Second time too
                    commons_setArray('array1', createFloatArray(4))
                    assert_integersEqual(callbackCallCounter, 2)
                    
                    // But after unsubscribe, it isn't
                    commons_cancelArrayChangesSubscription(subscription)
                    const someArray = createFloatArray(3)
                    someArray[0] = 1.1
                    someArray[1] = 1.2
                    someArray[2] = 1.3
                    commons_setArray('array1', someArray)
                    assert_integersEqual(callbackCallCounter, 2)

                    // But array is still what was set last
                    assert_floatArraysEqual(
                        commons_getArray('array1'),
                        someArray
                    )
                `,
            },
        ],
        [
            core.codeGenerator,
            sked,
            commonsCore,
            commonsArrays.codeGenerator,
            commonsWaitEngineConfigure,
            commonsWaitFrame,
            () => Var('Int', 'callbackCallCounter', '0')
        ]
    )
})
