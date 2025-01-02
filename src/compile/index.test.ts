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
import compile from './index'
import { UserCompilationSettings } from './types'

describe('compile', () => {
    const COMPILER_SETTINGS_AS: UserCompilationSettings = {
        audio: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        }
    }

    const COMPILER_SETTINGS_JS: UserCompilationSettings = {
        audio: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        },
    }

    it('should compile assemblyscript without error', () => {
        const compileResult = compile(
            {},
            {},
            'assemblyscript',
            COMPILER_SETTINGS_AS
        )
        assert.ok(compileResult.status === 0)
        assert.strictEqual(typeof compileResult.code, 'string')
    })

    it('should compile javascript without error', () => {
        const compileResult = compile(
            {},
            {},
            'javascript',
            COMPILER_SETTINGS_JS
        )
        assert.ok(compileResult.status === 0)
        assert.strictEqual(typeof compileResult.code, 'string')
    })
})
