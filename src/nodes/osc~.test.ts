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
import { generateFramesForNode, COMPILER_SETTINGS } from '../test-helpers'

describe('osc~', () => {
    it('should work with signal frequency', () => {
        const { sampleRate } = COMPILER_SETTINGS
        const J = (2 * Math.PI) / sampleRate
        const frames = generateFramesForNode(
            {
                type: 'osc~',
                args: { frequency: 0 },
                connectedSources: ['0_signal'],
            },
            [
                { '0_signal': 1 },
                { '0_signal': 1 },
                { '0_signal': 2 },
                { '0_signal': 2 },
                { '0_signal': 0.5 },
                { '0_signal': 0.5 },
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': Math.cos(0) },
            { '0': Math.cos(1 * J) },
            { '0': Math.cos(2 * J) },
            { '0': Math.cos(4 * J) },
            { '0': Math.cos(6 * J) },
            { '0': Math.cos(6.5 * J) },
        ])
    })

    it('should work with control frequency', () => {
        const { sampleRate } = COMPILER_SETTINGS
        const J = (2 * Math.PI) / sampleRate

        const frames = generateFramesForNode(
            { type: 'osc~', args: { frequency: 1 } },
            [
                { '0_control': [] },
                { '0_control': [] },
                { '0_control': [[3]] },
                { '0_control': [] },
                { '0_control': [] },
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': Math.cos(0) },
            { '0': Math.cos(1 * J) },
            { '0': Math.cos(2 * J) },
            { '0': Math.cos(5 * J) },
            { '0': Math.cos(8 * J) },
        ])
    })
})
