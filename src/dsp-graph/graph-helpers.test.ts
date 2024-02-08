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

import { testGraphIntegrity } from './graph-helpers'
import assert from 'assert'
import { nodeDefaults } from './graph-helpers'

describe('graph-helpers', () => {
    describe('testGraphIntegrity', () => {
        it('should return null if graph is ok', () => {
            const graphIntegrity = testGraphIntegrity({
                n1: {
                    ...nodeDefaults('n1', 'bla'),
                    sources: {
                        '0': [{ nodeId: 'n2', portletId: '2' }],
                    },
                    inlets: {
                        0: { id: '0', type: 'message' },
                    }
                },
                n2: {
                    ...nodeDefaults('n2', 'blo'),
                    sinks: {
                        '2': [
                            { nodeId: 'n1', portletId: '0' },
                            { nodeId: 'n3', portletId: '22' },
                        ],
                    },
                    outlets: {
                        2: { id: '2', type: 'message' },
                    }
                },
                n3: {
                    ...nodeDefaults('n3', 'blu'),
                    sources: {
                        '22': [{ nodeId: 'n2', portletId: '2' }],
                    },
                    inlets: {
                        22: { id: '22', type: 'message' },
                    }
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
                    inlets: {
                        0: { id: '0', type: 'message' },
                    }
                },
                n2: {
                    ...nodeDefaults('n2', 'blo'),
                    outlets: {
                        2: { id: '2', type: 'message' },
                    }
                },
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
