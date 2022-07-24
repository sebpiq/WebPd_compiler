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

import { assertNodeOutput } from "./test-helpers"


describe('msg', () => {
    it('should transfer directly messages without dollar strings', () => {
        assertNodeOutput(
            {
                type: 'msg',
                args: { template: [123, 'hello'] },
            },
            [{ '0': [['bang'], ['blabla'], ['quoi?', 456]] }], [
            {
                '0': [
                    [123, 'hello'],
                    [123, 'hello'],
                    [123, 'hello'],
                ],
            },
        ])
    })

    it('should substitute entire dollar strings', () => {
        assertNodeOutput(
            {
                type: 'msg',
                args: { template: [123, '$2', '$1'] },
            },
            [
                {
                    '0': [
                        ['wow', 'hehe', 'hoho'],
                        ['blabla', 456],
                    ],
                },
            ], [
            {
                '0': [
                    [123, 'hehe', 'wow'],
                    [123, 456, 'blabla'],
                ],
            },
        ])
    })

    it('should substitute dollar strings within strings', () => {
        assertNodeOutput(
            {
                type: 'msg',
                args: { template: ['hello_$2', '$1', 'greetings'] },
            },
            [
                {
                    '0': [
                        ['earth', 'saturn'],
                        ['satan', 666],
                    ],
                },
            ], [
            {
                '0': [
                    ['hello_saturn', 'earth', 'greetings'],
                    ['hello_666', 'satan', 'greetings'],
                ],
            },
        ])
    })
})
