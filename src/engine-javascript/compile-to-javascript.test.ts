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

        const modelTarray: JavaScriptEngine['commons'] = {
            getArray: () => undefined,
            setArray: () => undefined,
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
            commons: modelTarray,
            fs: modelFs,
            inletCallers: {},
            outletListeners: {},
        }

        assert.deepStrictEqual(
            Object.keys(engine).sort(),
            Object.keys(modelEngine).sort()
        )
        assert.deepStrictEqual(
            Object.keys(engine.commons).sort(),
            Object.keys(modelTarray).sort()
        )
        assert.deepStrictEqual(
            Object.keys(engine.fs).sort(),
            Object.keys(modelFs).sort()
        )
    })
})
