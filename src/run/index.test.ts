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
import packageInfo from '../../package.json'
import assert from 'assert'
import { makeGraph } from '../dsp-graph/test-helpers'
import compile from '../compile'
import { compileAssemblyscript } from '../engine-assemblyscript/run/test-helpers'
import { readMetadata } from './index'
import { AnonFunc, Var } from '../ast/declare'
import { EngineMetadata } from './types'
import { UserCompilationSettings, NodeImplementations } from '../compile/types'

describe('readMetadata', () => {
    const GRAPH = makeGraph({
        node1: {
            inlets: {
                '0': { type: 'message', id: '0' },
            },
            isPushingMessages: true,
        },
    })
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            messageReceivers: () => ({
                '0': AnonFunc([Var('Message', 'message')])``,
            }),
        },
    }
    const COMPILATION_SETTINGS: UserCompilationSettings = {
        io: {
            messageReceivers: {
                node1: {
                    portletIds: ['0'],
                },
            },
            messageSenders: {},
        },
    }

    const EXPECTED_METADATA: EngineMetadata = {
        libVersion: packageInfo.version,
        audioSettings: {
            blockSize: 0,
            sampleRate: 0,
            bitDepth: 64,
            channelCount: {
                in: 2,
                out: 2,
            },
        },
        compilation: {
            io: {
                messageReceivers: {
                    node1: {
                        portletIds: ['0'],
                    },
                },
                messageSenders: {},
            },
            variableNamesIndex: {
                io: {
                    messageReceivers: {
                        node1: {
                            '0': 'IORCV_node1_0',
                        },
                    },
                    messageSenders: {},
                },
            },
        },
    }

    it('should read metadata from wasm', async () => {
        const result = compile(
            GRAPH,
            NODE_IMPLEMENTATIONS,
            'assemblyscript',
            COMPILATION_SETTINGS
        )
        if (result.status !== 0) {
            throw new Error(`Compilation failed: ${result.status}`)
        }
        const wasmBuffer = await compileAssemblyscript(result.code, 64)
        const metadata = await readMetadata('assemblyscript', wasmBuffer)
        assert.deepStrictEqual(metadata, EXPECTED_METADATA)
    })

    it('should read metadata from javascript', async () => {
        const result = compile(
            GRAPH,
            NODE_IMPLEMENTATIONS,
            'javascript',
            COMPILATION_SETTINGS
        )
        if (result.status !== 0) {
            throw new Error(`Compilation failed: ${result.status}`)
        }
        const metadata = await readMetadata('javascript', result.code)
        assert.deepStrictEqual(metadata, EXPECTED_METADATA)
    })
})
