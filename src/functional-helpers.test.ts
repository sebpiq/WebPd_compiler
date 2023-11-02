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
import { countTo, renderCode } from './functional-helpers'

describe('functional-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })

        it('should render code lines with numbers', () => {
            const code = renderCode`bla
${['blo', 456.789, ['blu', ['ble', 123]]]}`

            assert.strictEqual(code, 'bla\nblo\n456.789\nblu\nble\n123')
        })

        it('should render number 0 correctly', () => {
            const code = renderCode`bla ${0} ${[0]}`

            assert.strictEqual(code, 'bla 0 0')
        })

        it('should remove empty lines', () => {
            const code = renderCode`bla
${['', 'bli', ['', ['', 'bly']]]}`

            assert.strictEqual(code, 'bla\nbli\nbly')
        })
    })

    describe('countTo', () => {
        it('should generate a list to the count non-inclusive', () => {
            assert.deepStrictEqual(countTo(3), [0, 1, 2])
        })
    })
})
