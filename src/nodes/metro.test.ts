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

import { assertNodeOutput, COMPILER_OPTIONS } from './test-helpers'

describe('metro', () => {
    it('should start metro at rate passed as arg', async () => {
        await assertNodeOutput(
            {
                type: 'metro',
                args: { rate: (2 * 1000) / COMPILER_OPTIONS.sampleRate },
            },
            [
                {}, // frame 1
                {}, // frame 2
                {
                    // frame 3
                    '0': [['bang']],
                },
                {}, // frame 4
                {}, // frame 5
            ],
            [
                { '0': [] },
                { '0': [] },
                { '0': [['bang']] },
                { '0': [] },
                { '0': [['bang']] },
            ]
        )
    })

    it('should start metro when sent 1', async () => {
        await assertNodeOutput(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_OPTIONS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [[1]],
                },
                {}, // frame 2
            ],
            [
                { '0': [['bang']] },
                { '0': [['bang']] },
            ]
        )
    })

    it('should start metro at rate passed to inlet 1', async () => {
        await assertNodeOutput(
            {
                type: 'metro',
                args: { rate: (2 * 1000) / COMPILER_OPTIONS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [['bang']],
                },
                {}, // frame 2
                {
                    // frame 3
                    '1': [[1000 / COMPILER_OPTIONS.sampleRate]],
                },
                {}, // frame 4
                {}, // frame 5
            ],
            [
                { '0': [['bang']] },
                { '0': [] },
                { '0': [['bang']] },
                { '0': [['bang']] },
                { '0': [['bang']] },
            ]
        )
    })

    it('should stop metro when receiving stop', async () => {
        await assertNodeOutput(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_OPTIONS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [['bang']],
                },
                {}, // frame 2
                {
                    // frame 3
                    '0': [['stop']],
                },
            ],
            [
                { '0': [['bang']] },
                { '0': [['bang']] },
                { '0': [] },
            ]
        )
    })

    it('should stop metro when receiving 0', async () => {
        await assertNodeOutput(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_OPTIONS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [['bang']],
                },
                {}, // frame 2
                {
                    // frame 3
                    '0': [[0]],
                },
            ],
            [
                { '0': [['bang']] },
                { '0': [['bang']] },
                { '0': [] },
            ]
        )
    })
})
