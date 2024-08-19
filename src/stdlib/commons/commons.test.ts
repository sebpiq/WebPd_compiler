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
import { AnonFunc, ast, ConstVar, Func, Var } from '../../ast/declare'
import { runTestSuite } from '../../test-helpers'
import { commonsArrays, commonsWaitFrame } from './commons'
import { core } from '../core/core'
import { sked } from '../sked/sked'

describe('commons', () => {
    // prettier-ignore
    runTestSuite(
        [
            {
                description:
                    'setArray > should set the array and notifiy the subscribers hooks %s',
                testFunction: ({ globals: { sked, commons } }) => AnonFunc()`
                    callbackCallCounter = 0

                    ${ConstVar(
                        sked.Id!,
                        'subscription',
                        ast`${commons.subscribeArrayChanges}(
                            'array1', 
                            ${Func('callback')`
                                callbackCallCounter++
                            `}
                        )`
                    )}

                    // First time array is set, subscriber is notified
                    ${commons.setArray}('array1', createFloatArray(5))
                    assert_integersEqual(callbackCallCounter, 1)

                    // Second time too
                    ${commons.setArray}('array1', createFloatArray(4))
                    assert_integersEqual(callbackCallCounter, 2)
                    
                    // But after unsubscribe, it isn't
                    ${commons.cancelArrayChangesSubscription}(subscription)
                    const someArray = createFloatArray(3)
                    someArray[0] = 1.1
                    someArray[1] = 1.2
                    someArray[2] = 1.3
                    ${commons.setArray}('array1', someArray)
                    assert_integersEqual(callbackCallCounter, 2)

                    // But array is still what was set last
                    assert_floatArraysEqual(
                        ${commons.getArray}('array1'),
                        someArray
                    )
                `,
            },
            {
                description:
                    'arrays > should embed arrays passed in settings %s',
                testFunction: ({ globals: { commons } }) => AnonFunc()`
                    ${ConstVar('FloatArray', 'expected', `createFloatArray(3)`)}
                    expected[0] = 11
                    expected[1] = 12
                    expected[2] = 666

                    assert_floatArraysEqual(
                        ${commons.getArray}('embeddedArray'),
                        expected,
                    )
                `,
            },
        ],
        [
            core,
            sked,
            commonsArrays,
            commonsWaitFrame,
            {
                namespace: 'tests',
                code: () => Var('Int', 'callbackCallCounter', '0'),
            },
        ],
        {
            arrays: {
                embeddedArray: new Float32Array([11, 12, 666]),
            },
        }
    )
})
