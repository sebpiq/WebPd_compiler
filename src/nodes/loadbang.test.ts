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
