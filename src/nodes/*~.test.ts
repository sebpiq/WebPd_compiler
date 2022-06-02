import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('*~', () => {
    it('should work with signal as inlet 1', async () => {
        const frames = await generateFramesForNode(
            { type: '*~', args: { value: 1 }, connectedSources: ['1_signal'] },
            [
                { '0': 1, '1_signal': 1 },
                { '0': 10, '1_signal': 2 },
                { '0': 100, '1_signal': 3 },
            ]
        )
        assert.deepStrictEqual(frames, [{ '0': 1 }, { '0': 20 }, { '0': 300 }])
    })

    it('should work with control messages to inlet 1', async () => {
        const frames = await generateFramesForNode(
            { type: '*~', args: { value: 2 }, connectedSources: ['1_control'] },
            [
                { '0': 1 },
                { '0': 2, '1_control': [[3]] },
                { '0': 3 },
                { '0': 4, '1_control': [[4]] },
                { '0': 5 },
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 2 },
            { '0': 6 },
            { '0': 9 },
            { '0': 16 },
            { '0': 20 },
        ])
    })
})