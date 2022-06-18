import assert from 'assert'
import { generateFramesForNode } from '../test-helpers'

describe('msg', () => {
    it('should transfer directly messages without dollar strings', () => {
        const frames = generateFramesForNode(
            {
                type: 'msg',
                args: { template: [123, 'hello'] },
            },
            [
                {'0': [['bang'], ['blabla'], ['quoi?', 456]]},
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [[123, 'hello'], [123, 'hello'], [123, 'hello']] },
        ])
    })

    it('should substitute entire dollar strings', () => {
        const frames = generateFramesForNode(
            {
                type: 'msg',
                args: { template: [123, '$2', '$1'] },
            },
            [
                {'0': [['wow', 'hehe', 'hoho'], ['blabla', 456]]},
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [[123, 'hehe', 'wow'], [123, 456, 'blabla']] },
        ])
    })

    it('should substitute dollar strings within strings', () => {
        const frames = generateFramesForNode(
            {
                type: 'msg',
                args: { template: ['hello_$2', '$1', 'greetings'] },
            },
            [
                {'0': [['earth', 'saturn'], ['satan', 666]]},
            ]
        )
        assert.deepStrictEqual(frames, [
            { '0': [['hello_saturn', 'earth', 'greetings'], ['hello_666', 'satan', 'greetings']] },
        ])
    })

})
