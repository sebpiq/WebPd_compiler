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
import { makeCompilation } from '../test-helpers'
import compileToJavascript from './compile-to-javascript'
import { JavaScriptEngine } from './types'

describe('compileToJavascript', () => {
    it('should be a JavaScript engine when evaled', () => {
        const compilation = makeCompilation({
            target: 'javascript',
        })

        const code = compileToJavascript(compilation)

        const engine = new Function(`
            ${code}
            return exports
        `)()

        const modelFs: JavaScriptEngine['fs'] = {
            sendReadSoundFileResponse: () => undefined,
            sendWriteSoundFileResponse: () => undefined,
            sendSoundStreamData: () => undefined,
            closeSoundStream: () => undefined,
            onReadSoundFile: () => undefined,
            onWriteSoundFile: () => undefined,
            onOpenSoundReadStream: () => undefined,
            onOpenSoundWriteStream: () => undefined,
            onSoundStreamData: () => undefined,
            onCloseSoundStream: () => undefined,
        }

        const modelTarray: JavaScriptEngine['farray'] = {
            get: () => undefined,
            set: () => undefined,
        }

        const modelEngine: JavaScriptEngine = {
            metadata: {
                audioSettings: {
                    bitDepth: 32,
                    channelCount: { in: 2, out: 2 },
                    sampleRate: 0,
                    blockSize: 0,
                },
                compilation: {
                    inletCallerSpecs: {},
                    outletListenerSpecs: {},
                    codeVariableNames: {} as any,
                },
            },
            configure: (_: number) => {},
            loop: () => new Float32Array(),
            farray: modelTarray,
            fs: modelFs,
            inletCallers: {},
            outletListeners: {},
        }

        assert.deepStrictEqual(
            Object.keys(engine).sort(),
            Object.keys(modelEngine).sort()
        )
        assert.deepStrictEqual(
            Object.keys(engine.farray).sort(),
            Object.keys(modelTarray).sort()
        )
        assert.deepStrictEqual(
            Object.keys(engine.fs).sort(),
            Object.keys(modelFs).sort()
        )
    })
})
