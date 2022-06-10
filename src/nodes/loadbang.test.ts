import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('loadbang', () => {
    it('should output a bang on creation', async () => {
        const frames = await generateFramesForNode(
            { type: 'loadbang', args: {} },
            [{}, {}, {}]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['bang']] },
            { '0': [] },
            { '0': [] },
        ])
    })
})
