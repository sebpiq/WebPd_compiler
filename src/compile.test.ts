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
import assert from 'assert'
import compile, { validateSettings } from './compile'
import { CompilationSettings } from './types'

describe('compile', () => {
    const COMPILER_SETTINGS_AS: CompilationSettings = {
        audioSettings: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        },
        target: 'assemblyscript',
    }

    const COMPILER_SETTINGS_JS: CompilationSettings = {
        audioSettings: {
            channelCount: { in: 2, out: 2 },
            bitDepth: 32,
        },
        target: 'javascript',
    }

    it('should compile assemblyscript without error', () => {
        const compileResult = compile({}, {}, COMPILER_SETTINGS_AS)
        assert.ok(compileResult.status === 0)
        assert.strictEqual(typeof compileResult.code, 'string')
    })

    it('should compile javascript without error', () => {
        const compileResult = compile({}, {}, COMPILER_SETTINGS_JS)
        assert.ok(compileResult.status === 0)
        assert.strictEqual(typeof compileResult.code, 'string')
    })

    describe('validateSettings', () => {
        it('should validate settings and set defaults', () => {
            const settings = validateSettings({
                target: 'assemblyscript',
                audioSettings: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth: 32,
                },
            })
            assert.deepStrictEqual(settings.outletListenerSpecs, {})
            assert.deepStrictEqual(settings.inletCallerSpecs, {})
            assert.deepStrictEqual(settings.arrays, {})
        })

        it('should throw error if bitDepth invalid', () => {
            assert.throws(() =>
                validateSettings({
                    target: 'assemblyscript',
                    channelCount: { in: 2, out: 2 },
                    sampleRate: 44100,
                    bitDepth: 666,
                } as any)
            )
        })
    })
})
