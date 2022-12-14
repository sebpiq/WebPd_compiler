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
import { NodeImplementations } from './types'

describe('test-helpers-node-implementations', () => {

    describe('assertNodeOutput', () => {
        it('should work with simple node', async () => {
            const nodeImplementations: NodeImplementations = {
                'counter': {
                    loop: (_, {ins, outs}) => 
                        `${outs.$0} = ${ins.$0} + 0.1`
                }
            }
        
            const node: DspGraph.Node = {
                ...nodeDefaults('someNode', 'counter'),
                inlets: {'0': {id: '0', type: 'signal'}},
                outlets: {'0': {id: '0', type: 'signal'}},
            }

            await nodeImplementationsTestHelpers.assertNodeOutput(
                {
                    node,
                    nodeImplementations,
                },
                // Inputs
                [
                    { '0': 1 },
                    { '0': 2 },
                    { '0': 3 },
                ],
                // Expected outputsmessage
                [
                    { '0': 1.1 }, 
                    { '0': 2.1 }, 
                    { '0': 3.1 }
                ]
            )
        })
    })
})
