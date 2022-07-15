/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('noise~', () => {
    it('should output white noise', () => {
        const frames = generateFramesForNode({ type: 'noise~', args: {} }, [
            {},
            {},
            {},
        ])
        const values = new Set(frames.map((frame) => frame['0']))
        values.forEach((value) => {
            assert.ok(-1 < value && value < 1)
        })
        // Test that all values are different
        assert.deepStrictEqual(values.size, 3)
    })
})
