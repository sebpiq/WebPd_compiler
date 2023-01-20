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

import { DspGraph } from '@webpd/dsp-graph'
import { nodeDefaults } from '@webpd/dsp-graph/src/test-helpers'
import * as nodeImplementationsTestHelpers from './test-helpers-node-implementations'
import { CompilerTarget, NodeImplementation } from './types'

describe('test-helpers-node-implementations', () => {
    describe('assertNodeOutput', () => {
        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should work with signal inlets %s', async ({ target }) => {
            const nodeImplementation: NodeImplementation<{}> = {
                loop: ({ ins, outs }) => `${outs.$0} = ${ins.$0} + 0.1`,
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: { '0': { id: '0', type: 'signal' } },
                outlets: { '0': { id: '0', type: 'signal' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    bitDepth: 32,
                    target,
                    node,
                    nodeImplementation,
                },
                [{ ins: { '0': 1 } }, { outs: { '0': 1.1 } }],
                [{ ins: { '0': 2 } }, { outs: { '0': 2.1 } }],
                [{ ins: { '0': 3 } }, { outs: { '0': 3.1 } }]
            )
        })

        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should work with message inlets %s', async ({ target }) => {
            const nodeImplementation: NodeImplementation<{}> = {
                messages: ({ globs, snds }) => ({
                    '0': `
                        ${snds.$0}(
                            msg_floats([
                                msg_readFloatToken(${globs.m}, 0) + 0.1
                            ])
                        )
                        return
                    `,
                }),
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: { '0': { id: '0', type: 'message' } },
                outlets: { '0': { id: '0', type: 'message' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    bitDepth: 64,
                    target,
                    node,
                    nodeImplementation,
                },
                [{ ins: { '0': [[1]] } }, { outs: { '0': [[1.1]] } }],
                [{ ins: { '0': [[2]] } }, { outs: { '0': [[2.1]] } }],
                [{ ins: { '0': [[3]] } }, { outs: { '0': [[3.1]] } }]
            )
        })

        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should send message at the right frame %s', async ({ target }) => {
            const nodeImplementation: NodeImplementation<{}> = {
                messages: ({ globs, snds }) => ({
                    '0': `
                        ${snds.$0}(
                            msg_floats([toFloat(${globs.frame})])
                        )
                        return
                    `,
                }),
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: { '0': { id: '0', type: 'message' } },
                outlets: { '0': { id: '0', type: 'message' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    bitDepth: 32,
                    target,
                    node,
                    nodeImplementation,
                },
                [{ ins: { '0': [['bang']] } }, { outs: { '0': [[0]] } }],
                [{ ins: { '0': [['bang']] } }, { outs: { '0': [[1]] } }],
                [{ ins: { '0': [['bang']] } }, { outs: { '0': [[2]] } }]
            )
        })

        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should handle tests with fs %s', async ({ target }) => {
            const nodeImplementation: NodeImplementation<{}> = {
                messages: ({}) => ({
                    '0': `
                        fs_readSoundFile('/bla', {
                            channelCount: 11,
                            sampleRate: 666,
                            bitDepth: 12,
                            encodingFormat: 'bla',
                            endianness: 'l',
                            extraOptions: 'bli',
                        }, () => {})
                        return
                    `,
                }),
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'DUMMY'),
                inlets: { '0': { id: '0', type: 'message' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    bitDepth: 64,
                    target,
                    node,
                    nodeImplementation,
                },
                [
                    { ins: { '0': [['bang']] } },
                    {
                        outs: {},
                        fs: {
                            onReadSoundFile: [
                                1,
                                '/bla',
                                [11, 666, 12, 'bla', 'l', 'bli'],
                            ],
                        },
                    },
                ]
            )
        })

        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should handle tests on arrays %s', async ({ target }) => {
            const nodeImplementation: NodeImplementation<{}> = {
                messages: () => ({
                    '0': `
                        farray_get('array1')[0] = 666
                        return
                    `,
                }),
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'DUMMY'),
                inlets: { '0': { id: '0', type: 'message' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    bitDepth: 32,
                    target,
                    node,
                    nodeImplementation,
                    arrays: {
                        array1: [111],
                    },
                },
                [{ ins: { '0': [['bang']] } }, { outs: {} }],
                [
                    { farray: { get: ['array1'] } },
                    { outs: {}, farray: { get: { array1: [666] } } },
                ]
            )
        })
    })
})
