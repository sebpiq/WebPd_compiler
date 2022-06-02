import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('mixer~', () => {
    it('should sum incoming signals together', async () => {
        const frames = await generateFramesForNode(
            { type: 'mixer~', args: { channels: 3 } },
            [
                {'0': 10, '1': 1, '2': 0.1},
                {'0': 20, '1': 2, '2': 0.2},
                {'0': 30, '1': 3, '2': 0.3},
            ],
        )
        assert.deepStrictEqual(frames, [
            { '0': 11.1 },
            { '0': 22.2 },
            { '0': 33.3 },
        ])
    })
})
