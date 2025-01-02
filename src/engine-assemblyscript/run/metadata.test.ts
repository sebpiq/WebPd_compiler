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

import packageInfo from '../../../package.json'
import assert from 'assert'
import { compileAssemblyscript } from './test-helpers'
import { EngineMetadata } from '../../run/types'
import { readMetadata } from './metadata'
import compile from '../../compile'
import {
    NodeImplementations,
    UserCompilationSettings,
} from '../../compile/types'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { AnonFunc, Var } from '../../ast/declare'

describe('metadata', () => {
    describe('readMetadata', () => {
        it('should extract the metadata', async () => {
            // ARRANGE
            const compilationSettings: UserCompilationSettings = {
                audio: {
                    bitDepth: 32,
                    channelCount: { in: 11, out: 22 },
                },
                io: {
                    messageReceivers: {
                        node1: ['0'],
                    },
                    messageSenders: {
                        node1: ['0'],
                    },
                },
            }

            const graph = makeGraph({
                node1: {
                    isPushingMessages: true,
                    inlets: { '0': { type: 'message', id: '0' } },
                    outlets: { '0': { type: 'message', id: '0' } },
                },
            })

            const nodeImplementations: NodeImplementations = {
                DUMMY: {
                    messageReceivers: (_, { msg }) => ({
                        '0': AnonFunc([Var(msg.Message, `m`)])``,
                    }),
                },
            }

            // ACT
            const result = await compile(
                graph,
                nodeImplementations,
                'assemblyscript',
                compilationSettings
            )

            if (result.status !== 0) {
                throw new Error(`Compilation failed ${result.status}`)
            }

            const wasmBuffer = await compileAssemblyscript(
                result.code,
                compilationSettings.audio!.bitDepth
            )

            const metadata = await readMetadata(wasmBuffer)

            // ASSERT
            assert.deepStrictEqual<EngineMetadata>(metadata, {
                libVersion: packageInfo.version,
                customMetadata: {},
                settings: {
                    audio: {
                        ...compilationSettings.audio!,
                        blockSize: 0,
                        sampleRate: 0,
                    },
                    io: {
                        messageReceivers:
                            compilationSettings.io!.messageReceivers!,
                        messageSenders: compilationSettings.io!.messageSenders!,
                    },
                },
                compilation: {
                    variableNamesIndex: {
                        io: {
                            messageReceivers: {
                                node1: {
                                    '0': 'IO_rcv_node1_0',
                                },
                            },
                            messageSenders: {
                                node1: {
                                    '0': 'IO_snd_node1_0',
                                },
                            },
                        },
                        // We don't test the details of the variable names generated
                        // for global code, as they are generated dynamically.
                        globals:
                            metadata.compilation.variableNamesIndex.globals,
                    },
                },
            })
        })
    })
})
