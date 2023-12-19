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
import { readMetadata } from './engine-lifecycle-bindings'
import compile from '../../compile'
import { CompilationSettings, NodeImplementations } from '../../compile/types'
import { makeGraph } from '../../dsp-graph/test-helpers'
import { AnonFunc, Var } from '../../ast/declare'

describe('engine-lifecycle-bindings', () => {
    describe('readMetadata', () => {
        it('should extract the metadata', async () => {
            const compilationSettings: CompilationSettings = {
                audio: {
                    bitDepth: 32,
                    channelCount: { in: 11, out: 22 },
                },
                io: {
                    messageReceivers: {
                        node1: { portletIds: ['0'] },
                    },
                    messageSenders: {
                        node1: { portletIds: ['0'] },
                    },
                }
            }

            const graph = makeGraph({
                node1: {
                    inlets: { '0': { type: 'message', id: '0' } },
                    outlets: { '0': { type: 'message', id: '0' } },
                },
            })

            const nodeImplementations: NodeImplementations = {
                DUMMY: {
                    messageReceivers: () => ({
                        '0': AnonFunc([Var('Message', 'm')])``,
                    }),
                },
            }

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
                compilationSettings.audio.bitDepth
            )

            const metadata = await readMetadata(wasmBuffer)

            assert.deepStrictEqual<EngineMetadata>(metadata, {
                libVersion: packageInfo.version,
                audioSettings: {
                    ...compilationSettings.audio,
                    blockSize: 0,
                    sampleRate: 0,
                },
                compilation: {
                    variableNamesIndex: {
                        io: {
                            messageReceivers: {
                                node1: { '0': 'ioRcv_node1_0' },
                            },
                            messageSenders: {
                                node1: { '0': 'ioSnd_node1_0' },
                            },
                        }
                    },
                    io: {
                        messageReceivers: compilationSettings.io.messageReceivers,
                        messageSenders: compilationSettings.io.messageSenders
                    },
                },
            })
        })
    })
})
