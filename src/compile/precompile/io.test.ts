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
import { makeSettings } from '../test-helpers'
import { addGraphNodesForMessageIo } from './io'
import {
    attachIoMessageSendersAndReceivers,
    generateVariableNamesIndex,
} from './variable-names-index'

describe('precompile.io', () => {
    describe('addGraphNodesForMessageIo', () => {
        it('should add io nodes to the graph', () => {
            const graph = makeGraph({
                n1: {
                    isPushingMessages: true,
                    inlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
                n2: {
                    isPushingMessages: true,
                    outlets: {
                        '0': { id: '0', type: 'message' },
                    },
                },
            })

            const settings = makeSettings({
                io: {
                    messageReceivers: {
                        n1: {
                            portletIds: ['0'],
                        },
                    },
                    messageSenders: {
                        n2: {
                            portletIds: ['0'],
                        },
                    },
                },
            })

            const variableNamesIndex = generateVariableNamesIndex()

            attachIoMessageSendersAndReceivers(
                variableNamesIndex,
                settings,
                graph
            )

            const graphWithIoNodes = addGraphNodesForMessageIo(
                graph,
                settings,
                variableNamesIndex
            )

            assert.deepStrictEqual(
                new Set(Object.keys(graphWithIoNodes)),
                new Set(['n1', 'n2', 'n_ioRcv_n1_0', 'n_ioSnd_n2_0'])
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

            assert.deepStrictEqual(graphWithIoNodes.n_ioSnd_n2_0, {
                ...nodeDefaults('n_ioSnd_n2_0', '_messageSender'),
                args: {
                    messageSenderName: 'ioSnd_n2_0',
                },
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
                sources: {
                    '0': [{ nodeId: 'n2', portletId: '0' }],
                },
            })
        })
    })
})
