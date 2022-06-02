import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('+~', () => {
    it('should work with signal as inlet 1', async () => {
        const frames = await generateFramesForNode(
            { type: '+~', args: { value: 1 }, connectedSources: ['1_signal'] },
            [
                {'0': 1, '1_signal': 0.1},
                {'0': 2, '1_signal': 0.2},
                {'0': 3, '1_signal': 0.3},
            ],
        )
        assert.deepStrictEqual(frames, [
            { '0': 1.1 },
            { '0': 2.2 },
            { '0': 3.3 },
        ])
    })

    it('should work with control messages to inlet 1', async () => {
        const frames = await generateFramesForNode(
            { type: '+~', args: { value: 10 }, connectedSources: ['1_control'] },
            [
                {'0': 1},
                {'0': 2, '1_control': [[0.1]]},
                {'0': 3},
                {'0': 4, '1_control': [[0.2]]},
                {'0': 5},
            ],
        )
        assert.deepStrictEqual(frames, [
            { '0': 11 },
            { '0': 2.1 },
            { '0': 3.1 },
            { '0': 4.2 },
            { '0': 5.2 },
        ])
    })
})
