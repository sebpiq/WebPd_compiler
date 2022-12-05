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
import { makeGraph } from '@webpd/shared/test-helpers'
import assert from 'assert'
import compile, { generatePortSpecs, validateSettings } from './compile'
import { generateEngineVariableNames } from './engine-variable-names'
import {
    CompilerSettings,
    EngineVariableNames,
    InletListeners,
    NodeImplementations,
    PortSpecs,
} from './types'

describe('compile', () => {
    const COMPILER_SETTINGS_AS: CompilerSettings = {
        audioSettings: {
            channelCount: 2,
            bitDepth: 32,
        },
        target: 'assemblyscript',
    }

    const COMPILER_SETTINGS_JS: CompilerSettings = {
        audioSettings: {
            channelCount: 2,
            bitDepth: 32,
        },
        target: 'javascript',
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => '',
        },
    }

    it('should compile assemblyscript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_AS)
        assert.strictEqual(typeof code, 'string')
    })

    it('should compile javascript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_JS)
        assert.strictEqual(typeof code, 'string')
    })

    describe('validateSettings', () => {
        it('should validate settings and set defaults', () => {
            const settings = validateSettings({
                target: 'assemblyscript',
                audioSettings: {
                    channelCount: 2,
                    bitDepth: 32,
                },
            })
            assert.deepStrictEqual(settings.inletListeners, {})
        })

        it('should throw error if bitDepth invalid', () => {
            assert.throws(() =>
                validateSettings({
                    target: 'assemblyscript',
                    channelCount: 2,
                    sampleRate: 44100,
                    bitDepth: 666,
                } as any)
            )
        })
    })

    describe('generatePortSpecs', () => {
        it('should generate portSpecs according to inletListeners', () => {
            const engineVariableNames = generateEngineVariableNames(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'control', id: 'inlet1' },
                            inlet2: { type: 'control', id: 'inlet2' },
                        },
                    },
                    node2: {
                        inlets: {
                            inlet1: { type: 'control', id: 'inlet1' },
                        },
                    },
                })
            )
            const inletListeners: InletListeners = {
                node1: ['inlet1', 'inlet2'],
                node2: ['inlet1'],
            }
            const portSpecs: PortSpecs = generatePortSpecs(
                engineVariableNames,
                inletListeners
            )
            assert.deepStrictEqual(portSpecs, {
                node1_INS_inlet1: { type: 'messages', access: 'r' },
                node1_INS_inlet2: { type: 'messages', access: 'r' },
                node2_INS_inlet1: { type: 'messages', access: 'r' },
            })
        })
    })
})
