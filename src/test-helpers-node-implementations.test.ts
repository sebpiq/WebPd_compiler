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
import { CompilerTarget, NodeImplementations } from './types'

describe('test-helpers-node-implementations', () => {
    describe('assertNodeOutput', () => {
        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should work with signal inlets %s', async ({ target }) => {
            const nodeImplementations: NodeImplementations = {
                counter: {
                    loop: (_, { ins, outs }) => `${outs.$0} = ${ins.$0} + 0.1`,
                },
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: { '0': { id: '0', type: 'signal' } },
                outlets: { '0': { id: '0', type: 'signal' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    target,
                    node,
                    nodeImplementations,
                },
                // Inputs
                [{ '0': 1 }, { '0': 2 }, { '0': 3 }],
                // Expected outputsmessage
                [{ '0': 1.1 }, { '0': 2.1 }, { '0': 3.1 }]
            )
        })

        it.each<{ target: CompilerTarget }>([
            { target: 'javascript' },
            { target: 'assemblyscript' },
        ])('should work with message inlets %s', async ({ target }) => {
            const nodeImplementations: NodeImplementations = {
                counter: {
                    messages: (_, { globs, snds }) => ({
                        '0': `
                            ${snds.$0}(
                                msg_floats([
                                    msg_readFloatToken(${globs.inMessage}, 0) + 0.1
                                ])
                            )
                        `
                    })
                },
            }

            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: { '0': { id: '0', type: 'message' } },
                outlets: { '0': { id: '0', type: 'message' } },
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    target,
                    node,
                    nodeImplementations,
                },
                // Inputs
                [{ '0': [[1]] }, { '0': [[2]] }, { '0': [[3]] }],
                // Expected outputsmessage
                [{ '0': [[1.1]] }, { '0': [[2.1]] }, { '0': [[3.1]] }]
            )
        })
    })
})
