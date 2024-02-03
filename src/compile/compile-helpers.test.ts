/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { DspGraph } from '../dsp-graph/types'
import { makeGraph } from '../dsp-graph/test-helpers'
import assert from 'assert'
import {
    buildFullGraphTraversal,
    buildGraphTraversalSignal,
    createNamespace,
    getNodeImplementation,
} from './compile-helpers'
import { NodeImplementation, NodeImplementations } from './types'
import { Sequence } from '../ast/declare'
import { makeSettings } from './test-helpers'

describe('compile-helpers', () => {
    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { dsp: () => Sequence([]) },
            boringNodeType: {},
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType')
                    .dsp,
                NODE_IMPLEMENTATIONS['someNodeType'].dsp
            )
        })

        it('should fill-in all fields with default functions', () => {
            const referenceImplementation: NodeImplementation = {
                dependencies: [],
            }
            const defaultImplementation = getNodeImplementation(
                NODE_IMPLEMENTATIONS,
                'boringNodeType'
            )

            assert.deepStrictEqual(
                referenceImplementation,
                defaultImplementation
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

    describe('buildFullGraphTraversal', () => {
        it('should combine signal and message traversals and remove duplicates', () => {
            // [  n1  ]         [  n5  ]
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
                    isPushingMessages: true,
                    sinks: {
                        '0': [['n3', '0']],
                        '1': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'message', id: '1' },
                    },
                },
                n3: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
                n5: {
                    isPushingMessages: true,
                },
            })

            const settings = makeSettings({
                io: {
                    messageReceivers: {},
                    messageSenders: {},
                },
            })

            const traversal = buildFullGraphTraversal(graph, settings)
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal.sort(), [
                'n1',
                'n2',
                'n3',
                'n4',
                'n5',
            ])
        })

        it('should add nodes that have an inlet caller declared', () => {
            const graph = makeGraph({
                n1: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'message', id: '0' },
                    },
                    sinks: {
                        '0': [['n2', '0']],
                    },
                },
                n2: {
                    inlets: {
                        '0': { type: 'message', id: '0' },
                    },
                },
            })

            const settings = makeSettings({
                io: {
                    messageReceivers: {
                        n1: { portletIds: ['0'] },
                    },
                    messageSenders: {},
                },
            })

            const traversal = buildFullGraphTraversal(graph, settings)
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal.sort(), [
                'n1',
                'n2',
            ])
        })
    })

    describe('buildGraphTraversalSignal', () => {
        it('should return signal traversal and remove duplicates', () => {
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
                    sinks: {
                        '0': [['n3', '0']],
                        '1': [['n4', '0']],
                    },
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n3: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
                n4: {
                    isPullingSignal: true,
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })
            const traversal = buildGraphTraversalSignal(graph)
            assert.deepStrictEqual<DspGraph.GraphTraversal>(traversal, [
                'n1',
                'n2',
                'n3',
                'n4',
            ])
        })
    })

    describe('createNamespace', () => {
        describe('get', () => {
            it('should proxy access to exisinting keys', () => {
                const namespace = createNamespace('dummy', {
                    bla: '1',
                    hello: '2',
                })
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.hello, '2')
            })
    
            it('should create automatic $ alias for keys starting with a number', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        '0': 'blabla',
                        '0_bla': 'bloblo',
                    }
                )
                assert.strictEqual(namespace.$0, 'blabla')
                assert.strictEqual(namespace.$0_bla, 'bloblo')
            })
    
            it('should throw error when trying to access unknown key', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                        hello: '2',
                    }
                )
                assert.throws(() => namespace.blo)
            })
    
            it('should not prevent from using JSON stringify', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                        hello: '2',
                    }
                )
                assert.deepStrictEqual(
                    JSON.stringify(namespace),
                    '{"bla":"1","hello":"2"}'
                )
            })
        })
        
        describe('set', () => {
            it('should allow setting a key that doesnt aready exist', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                    }
                )
                namespace.blo = '2'
                assert.strictEqual(namespace.bla, '1')
                assert.strictEqual(namespace.blo, '2')
            })
            it('should throw error when trying to overwrite existing key', () => {
                const namespace: { [key: string]: string } = createNamespace(
                    'dummy',
                    {
                        bla: '1',
                    }
                )
                assert.throws(() => (namespace.bla = '2'))
            })
            it('should allow setting a number key using dollar syntax', () => {
                const namespace: { [key: string]: string } = createNamespace('', {})
                namespace.$0 = 'bla'
                assert.strictEqual(namespace['0'], 'bla')
                assert.strictEqual(namespace.$0, 'bla')
            })
        })
    })
})
