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
import { COMPILER_SETTINGS, generateFramesForNode } from '../test-helpers'

describe('metro', () => {
    it('should start metro at rate passed as arg', () => {
        const frames = generateFramesForNode(
            {
                type: 'metro',
                args: { rate: (2 * 1000) / COMPILER_SETTINGS.sampleRate },
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
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [] },
            { '0': [] },
            { '0': [['bang']] },
            { '0': [] },
            { '0': [['bang']] },
        ])
    })

    it('should start metro when sent 1', () => {
        const frames = generateFramesForNode(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_SETTINGS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [[1]],
                },
                {}, // frame 2
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [['bang']] },
        ])
    })

    it('should start metro at rate passed to inlet 1', () => {
        const frames = generateFramesForNode(
            {
                type: 'metro',
                args: { rate: (2 * 1000) / COMPILER_SETTINGS.sampleRate },
            },
            [
                {
                    // frame 1
                    '0': [['bang']],
                },
                {}, // frame 2
                {
                    // frame 3
                    '1': [[1000 / COMPILER_SETTINGS.sampleRate]],
                },
                {}, // frame 4
                {}, // frame 5
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [] },
            { '0': [['bang']] },
            { '0': [['bang']] },
            { '0': [['bang']] },
        ])
    })

    it('should stop metro when receiving stop', () => {
        const frames = generateFramesForNode(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_SETTINGS.sampleRate },
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
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [['bang']] },
            { '0': [] },
        ])
    })

    it('should stop metro when receiving 0', () => {
        const frames = generateFramesForNode(
            {
                type: 'metro',
                args: { rate: (1 * 1000) / COMPILER_SETTINGS.sampleRate },
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
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [['bang']] },
            { '0': [] },
        ])
    })
})
