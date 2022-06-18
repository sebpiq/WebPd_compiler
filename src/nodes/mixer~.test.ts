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

describe('mixer~', () => {
    it('should sum incoming signals together', () => {
        const frames = generateFramesForNode(
            { type: 'mixer~', args: { channels: 3 } },
            [
                { '0': 10, '1': 1, '2': 0.1 },
                { '0': 20, '1': 2, '2': 0.2 },
                { '0': 30, '1': 3, '2': 0.3 },
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 11.1 },
            { '0': 22.2 },
            { '0': 33.3 },
        ])
    })
})
