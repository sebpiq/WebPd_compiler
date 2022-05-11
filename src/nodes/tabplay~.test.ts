import { ENGINE_ARRAYS_VARIABLE_NAME } from '@webpd/engine-core/src/eval-engine/constants'
import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('tabplay~', () => {
    it('should change array when sent set', async () => {
        ;(globalThis as any)[ENGINE_ARRAYS_VARIABLE_NAME] = {
            myArray: [1, 2, 3],
        }
        const frames = await generateFramesForNode(
            { type: 'tabplay~', args: { arrayName: 'UNKNOWN_ARRAY' } },
            [
                {}, // frame 1
                {}, // frame 2
                {
                    // frame 3

                    '0': [['set', 'myArray'], ['bang']],
                },
                {}, // frame 4
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 0, '1': [] },
            { '0': 0, '1': [] },
            { '0': 1, '1': [] },
            { '0': 2, '1': [] },
        ])
    })

    it('should read from beginning to end when receiving bang', async () => {
        ;(globalThis as any)[ENGINE_ARRAYS_VARIABLE_NAME] = {
            myArray: [11, 22, 33],
        }
        const frames = await generateFramesForNode(
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
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 0, '1': [] },
            { '0': 11, '1': [] },
            { '0': 22, '1': [] },
            { '0': 33, '1': [['bang']] },
            { '0': 0, '1': [] },
        ])
    })

    it('should read from sample when receiving float', async () => {
        ;(globalThis as any)[ENGINE_ARRAYS_VARIABLE_NAME] = {
            myArray: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        }
        const frames = await generateFramesForNode(
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
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 0, '1': [] },
            { '0': 0.4, '1': [] },
            { '0': 0.5, '1': [] },
            { '0': 0.6, '1': [] },
            { '0': 0.7, '1': [['bang']] },
            { '0': 0, '1': [] },
        ])
    })

    it('should read from sample to sample when receiving 2 floats', async () => {
        ;(globalThis as any)[ENGINE_ARRAYS_VARIABLE_NAME] = {
            myArray: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        }
        const frames = await generateFramesForNode(
            { type: 'tabplay~', args: { arrayName: 'myArray' } },
            [
                {}, // frame 1
                {
                    // frame 2
                    '0': [[3, 2]],
                },
                {}, // frame 3
                {}, // frame 4
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': 0, '1': [] },
            { '0': 0.4, '1': [] },
            { '0': 0.5, '1': [['bang']] },
            { '0': 0, '1': [] },
        ])
    })
})
