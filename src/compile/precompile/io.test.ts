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
import assert from 'assert'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { nodeDefaults } from '../../dsp-graph/graph-helpers'
import { makePrecompilation } from '../test-helpers'
import { addMessageSenderNode, addMessageReceiverNode } from './io'
import { attachIoMessageReceiverForNode, attachIoMessageSenderForNode } from '.'

describe('precompile.io', () => {
    describe('addMessageSenderNode', () => {
        it('should add io nodes to the graph', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({ graph, settings: {
                io: {
                    messageSenders: {
                        n1: {
                            portletIds: ['0'],
                        },
                    },
                    messageReceivers: {}
                },
            } })

            attachIoMessageSenderForNode(precompilation.output, graph.n1!)

            const graphWithIoNodes = addMessageSenderNode(
                precompilation, 'n1', '0'
            )

            assert.deepStrictEqual(
                new Set(Object.keys(graphWithIoNodes)),
                new Set(['n1', 'n_ioSnd_n1_0'])
            )

            assert.deepStrictEqual(graphWithIoNodes.n_ioSnd_n1_0, {
                ...nodeDefaults('n_ioSnd_n1_0', '_messageSender'),
                args: {
                    messageSenderName: 'ioSnd_n1_0',
                },
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
                sources: {
                    '0': [{ nodeId: 'n1', portletId: '0' }],
                },
            })
        })
    })

    describe('addMessageReceiverNode', () => {
        it('should add io nodes to the graph', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const precompilation = makePrecompilation({ graph, settings: {
                io: {
                    messageReceivers: {
                        n1: {
                            portletIds: ['0'],
                        },
                    },
                    messageSenders: {}
                },
            } })

            attachIoMessageReceiverForNode(precompilation.output, graph.n1!)

            const graphWithIoNodes = addMessageReceiverNode(
                precompilation, 'n1', '0'
            )

            assert.deepStrictEqual(
                new Set(Object.keys(graphWithIoNodes)),
                new Set(['n1', 'n_ioRcv_n1_0'])
            )

            assert.deepStrictEqual(graphWithIoNodes.n_ioRcv_n1_0, {
                ...nodeDefaults('n_ioRcv_n1_0', '_messageReceiver'),
                isPushingMessages: true,
                outlets: {
                    '0': { id: '0', type: 'message' },
                },
                sinks: {
                    '0': [{ nodeId: 'n1', portletId: '0' }],
                },
            })
        })
    })
})
