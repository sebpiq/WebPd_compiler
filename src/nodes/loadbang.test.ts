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

describe('loadbang', () => {
    it('should output a bang on creation', () => {
        const frames = generateFramesForNode({ type: 'loadbang', args: {} }, [
            {},
            {},
            {},
        ])
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [] },
            { '0': [] },
        ])
    })
})
