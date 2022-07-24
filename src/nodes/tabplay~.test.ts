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

import { assertNodeOutput } from './test-helpers'

describe('tabplay~', () => {
    it('should change array when sent set', async () => {
        await assertNodeOutput(
            { type: 'tabplay~', args: { arrayName: 'UNKNOWN_ARRAY' } },
            [
                {}, // frame 1
                {}, // frame 2
                {
                    // frame 3

                    '0': [['set', 'myArray'], ['bang']],
                },
                {}, // frame 4
            ], [
            { '0': 0, '1': [] },
            { '0': 0, '1': [] },
            { '0': 1, '1': [] },
            { '0': 2, '1': [] },
        ], {
            myArray: [1, 2, 3],
        })
    })

    it('should read from beginning to end when receiving bang', async () => {
        await assertNodeOutput(
            { type: 'tabplay~', args: { arrayName: 'myArray' } },
            [
                {}, // frame 1
                {
                    // frame 2
                    '0': [['bang']],
                },
                {}, // frame 3
                {}, // frame 4
                {}, // frame 5
            ], [
                { '0': 0, '1': [] },
                { '0': 11, '1': [] },
                { '0': 22, '1': [] },
                { '0': 33, '1': [['bang']] },
                { '0': 0, '1': [] },
            ], {
                myArray: [11, 22, 33],
            }
        )
    })

    it('should read from sample when receiving float', async () => {
        await assertNodeOutput(
            { type: 'tabplay~', args: { arrayName: 'myArray' } },
            [
                {}, // frame 1
                {
                    // frame 2
                    '0': [[3]],
                },
                {}, // frame 3
                {}, // frame 4
                {}, // frame 5
                {}, // frame 6
            ], [
            { '0': 0, '1': [] },
            { '0': 0.4, '1': [] },
            { '0': 0.5, '1': [] },
            { '0': 0.6, '1': [] },
            { '0': 0.7, '1': [['bang']] },
            { '0': 0, '1': [] },
        ], {
            myArray: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        })
    })

    it('should read from sample to sample when receiving 2 floats', async () => {
        await assertNodeOutput(
            { type: 'tabplay~', args: { arrayName: 'myArray' } },
            [
                {}, // frame 1
                {
                    // frame 2
                    '0': [[3, 2]],
                },
                {}, // frame 3
                {}, // frame 4
            ], [
                { '0': 0, '1': [] },
                { '0': 0.4, '1': [] },
                { '0': 0.5, '1': [['bang']] },
                { '0': 0, '1': [] },
            ], {
                myArray: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
            }
        )
    })
})
