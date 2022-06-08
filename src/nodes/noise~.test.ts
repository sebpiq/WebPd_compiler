import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('noise~', () => {
    it('should output white noise', async () => {
        const frames = await generateFramesForNode(
            { type: 'noise~', args: { channels: 3 } },
            [
                { '0': 10, '1': 1, '2': 0.1 },
                { '0': 20, '1': 2, '2': 0.2 },
                { '0': 30, '1': 3, '2': 0.3 },
            ]
        )
        const values = new Set(frames.map(frame => frame['0']))
        values.forEach(value => {
            assert.ok(-1 < value && value < 1)
        })
        // Test that all values are different
        assert.deepStrictEqual(values.size, 3)
    })
})
