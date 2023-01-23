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
import { NodeImplementation, NodeImplementations } from './types'

describe('compile-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })

        it('should render code lines with numbers', () => {
            const code = renderCode`bla
${['blo', 456.789, ['blu', ['ble', 123]]]}`

            assert.strictEqual(code, 'bla\nblo\n456.789\nblu\nble\n123')
        })
    })

    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { loop: () => `` },
            boringNodeType: {},
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType')
                    .loop,
                NODE_IMPLEMENTATIONS['someNodeType'].loop
            )
        })

        it('should fill-in all fields with default functions', () => {
            const referenceImplementation: Required<NodeImplementation<any>> = {
                stateVariables: {},
                declare: () => '',
                loop: () => '',
                messages: () => ({}),
                events: () => ({}),
                sharedCode: [],
            }
            const defaultImplementation = getNodeImplementation(
                NODE_IMPLEMENTATIONS,
                'boringNodeType'
            )

            assert.deepStrictEqual(
                Object.entries(referenceImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ]),
                Object.entries(defaultImplementation).map(([name, obj]) => [
                    name,
                    typeof obj === 'function' ? (obj as any)() : obj,
                ])
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
