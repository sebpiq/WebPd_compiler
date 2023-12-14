import assert from 'assert'
import { makeGraph } from '../dsp-graph/test-helpers'
import compile from '../compile'
import { compileAscCode } from '../engine-assemblyscript/run/test-helpers'
import { readMetadata } from './index'
import { AnonFunc, Var } from '../ast/declare'

describe('readMetadata', () => {
    const GRAPH = makeGraph({
        node1: {
            inlets: {
                '0': { type: 'message', id: '0' },
            },
            isPushingMessages: true,
        },
    })
    const NODE_IMPLEMENTATIONS = {
        DUMMY: {
            messageReceivers: () => ({
                '0': AnonFunc([Var('Message', 'message')])``,
            }),
        },
    }
    const COMPILATION_SETTINGS = {
        io: {
            messageReceivers: {
                node1: {
                    portletIds: ['0'],
                },
            },
            messageSenders: {},
        },
    }

    const EXPECTED_METADATA = {
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
                    messageReceivers: { node1: { '0': 'ioRcv_node1_0' } },
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
        const wasmBuffer = await compileAscCode(result.code, 64)
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
