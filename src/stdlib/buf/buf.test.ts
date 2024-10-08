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

import { AnonFunc, ConstVar, Var } from '../../ast/declare'
import { runTestSuite } from '../../test-helpers'
import { bufCore, bufPushPull, bufWriteRead } from './buf'
import { core } from '../core/core'

describe('buf', () => {
    // prettier-ignore
    runTestSuite(
        [
            {
                description:
                    'common > should clear content when calling buf!.clear %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    ${ConstVar(buf!.SoundBuffer, `soundBuffer`, `${buf!.create}(5)`)}
                    ${ConstVar(`FloatArray`, `data`, `createFloatArray(4)`)}
                    data.set([11, 22, 33, 44])

                    ${buf!.pushBlock}(
                        soundBuffer,
                        data,
                    )
                    ${buf!.clear}(soundBuffer)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 0)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 0)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 0)
                `,
            },

            {
                description:
                    'push / pull mode > should be able to push and pull from SoundBuffer %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    const soundBuffer = ${buf!.create}(5)
                    ${Var(`Int`, `availableLength`, `-1`)}
                    let data3 = createFloatArray(3)
                    let data4 = createFloatArray(4)
                    data3.set([55, 66, 77])
                    data4.set([11, 22, 33, 44])

                    availableLength = ${buf!.pushBlock}(
                        soundBuffer,
                        data4
                    )
                    assert_integersEqual(availableLength, 4)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 11)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 22)
                    assert_integersEqual(
                        soundBuffer.pullAvailableLength,
                        2
                    )

                    // Push another block that will span over the end, and wrap
                    // back to the beginning of the buffer
                    availableLength = ${buf!.pushBlock}(
                        soundBuffer,
                        data3,
                    )
                    assert_integersEqual(availableLength, 5)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 33)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 44)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 55)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 66)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 77)
                    assert_integersEqual(
                        soundBuffer.pullAvailableLength,
                        0
                    )
                `,
            },

            {
                description:
                    'push / pull mode > should return 0 when pulling from empty buffer %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    const soundBuffer = ${buf!.create}(5)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 0)
                    assert_floatsEqual(${buf!.pullSample}(soundBuffer), 0)
                `,
            },

            {
                description:
                    'read / write mode > should return 0 when reading from an empty buffer %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    const soundBuffer = ${buf!.create}(5)
                    assert_floatsEqual(${buf!.readSample}(soundBuffer, 0), 0)
                `,
            },

            {
                description:
                    'read / write mode > should write a sample to the buffer %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    const soundBuffer = ${buf!.create}(3)
                    ${buf!.writeSample}(soundBuffer, 11)
                    ${buf!.writeSample}(soundBuffer, 22)
                    ${buf!.writeSample}(soundBuffer, 33)
                    assert_floatsEqual(${buf!.readSample}(soundBuffer, 0), 33)
                    assert_floatsEqual(${buf!.readSample}(soundBuffer, 1), 22)
                    assert_floatsEqual(${buf!.readSample}(soundBuffer, 2), 11)
                `,
            },

            {
                description:
                    'read / write mode > should not throw an error with wrong values for read offset %s',
                testFunction: ({ globals: { buf } }) => AnonFunc()`
                    const soundBuffer = ${buf!.create}(3)
                    ${buf!.writeSample}(soundBuffer, 11)
                    ${buf!.writeSample}(soundBuffer, 22)
                    ${buf!.writeSample}(soundBuffer, 33)
                    // Should not throw :
                    ${buf!.readSample}(soundBuffer, 4)
                    // Should not throw :
                    ${buf!.readSample}(soundBuffer, 1000)
                    // Should not throw :
                    ${buf!.readSample}(soundBuffer, -1345)
                `,
            },
        ],
        [core, bufCore, bufPushPull, bufWriteRead]
    )
})
