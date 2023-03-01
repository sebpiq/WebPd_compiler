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

import { testGraphIntegrity } from './graph-helpers'
import assert from 'assert'
import { nodeDefaults } from './test-helpers'

describe('graph-helpers', () => {
    describe('testGraphIntegrity', () => {
        it('should return null if graph is ok', () => {
            const graphIntegrity = testGraphIntegrity({
                n1: {
                    ...nodeDefaults('n1', 'bla'),
                    sources: {
                        '0': [{ nodeId: 'n2', portletId: '2' }],
                    },
                },
                n2: {
                    ...nodeDefaults('n2', 'blo'),
                    sinks: {
                        '2': [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n3', portletId: '22' },
                        ],
                    },
                },
                n3: {
                    ...nodeDefaults('n3', 'blu'),
                    sources: {
                        '22': [{ nodeId: 'n2', portletId: '2' }],
                    },
                },
            })
            assert.strictEqual(graphIntegrity, null)
        })

        it('should return connection inconsistencies', () => {
            const graphIntegrity = testGraphIntegrity({
                n1: {
                    ...nodeDefaults('n1', 'bla'),
                    sources: {
                        '0': [{ nodeId: 'n2', portletId: '2' }],
                    },
                },
                n2: nodeDefaults('n2', 'blo'),
            })
            assert.deepStrictEqual(graphIntegrity, {
                inconsistentConnections: [
                    [
                        { nodeId: 'n2', portletId: '2' },
                        { nodeId: 'n1', portletId: '0' },
                    ],
                ],
            })
        })
    })
})
