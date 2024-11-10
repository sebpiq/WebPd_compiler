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
import { validateSettings } from './settings'

describe('validateSettings', () => {
    it('should validate settings and set defaults', () => {
        const settings = validateSettings({}, 'javascript')
        assert.deepStrictEqual(settings.io, {
            messageReceivers: {},
            messageSenders: {},
        })
        assert.deepStrictEqual(settings.arrays, {})
        assert.deepStrictEqual(settings.audio, {
            channelCount: { in: 2, out: 2 },
            bitDepth: 64,
        })
        assert.strictEqual(settings.debug, false)
        assert.deepStrictEqual(settings.customMetadata, {})
    })

    it('should throw error if bitDepth invalid', () => {
        assert.throws(() =>
            validateSettings(
                {
                    target: 'assemblyscript',
                    audio: {
                        channelCount: { in: 2, out: 2 },
                        bitDepth: 666,
                    },
                } as any,
                'javascript'
            )
        )
    })
})
