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

import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import {
    getNodeImplementation,
    graphTraversalForCompile,
    renderCode,
} from './compile-helpers'
import { NodeImplementations } from './types'

describe('compile-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })
    })

    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { loop: () => `` },
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType'),
                NODE_IMPLEMENTATIONS['someNodeType']
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() =>
                getNodeImplementation(
                    NODE_IMPLEMENTATIONS,
                    'someUnknownNodeType'
                )
            )
        })
    })

    describe('graphTraversalForCompile', () => {
        it('should combine signal and message traversals and remove duplicates', () => {
            // [  n1  ]
            //    / \
            //   |  [  n2  ]
            //   |    /   \
            // [  n3  ]  [  n4  ]
            const graph = makeGraph({
                n1: {
                    sinks: {
                        '0': [
                            ['n2', '0'],
                            ['n3', '0'],
                        ],
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n2: {
                    isMessageSource: true,
                    sinks: {
                        '0': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n3: {
                    isSignalSink: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })
            const traversal = graphTraversalForCompile(graph)
            assert.deepStrictEqual(
                traversal.map((node) => node.id),
                ['n1', 'n3', 'n2', 'n4']
            )
        })
    })
})
