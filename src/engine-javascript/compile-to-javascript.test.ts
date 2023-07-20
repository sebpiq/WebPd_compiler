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
import { RawJavaScriptEngine, createRawModule } from './JavaScriptEngine'

describe('compileToJavascript', () => {
    it('should be a JavaScript engine when evaled', () => {
        const compilation = makeCompilation({
            target: 'javascript',
        })

        const code = compileToJavascript(compilation)
        const rawJavaScriptEngine = createRawModule(code)

        const modelRawEngine: RawJavaScriptEngine = {
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
            inletCallers: {},
            outletListeners: {},

            commons_getArray: () => undefined,
            commons_setArray: () => undefined,

            x_fs_onReadSoundFileResponse: () => undefined,
            x_fs_onWriteSoundFileResponse: () => undefined,
            x_fs_onCloseSoundStream: () => undefined,
            x_fs_onSoundStreamData: () => undefined,
            i_fs_openSoundWriteStream: () => undefined,
            i_fs_sendSoundStreamData: () => undefined,
            i_fs_openSoundReadStream: () => undefined,
            i_fs_closeSoundStream: () => undefined,
            i_fs_writeSoundFile: () => undefined,
            i_fs_readSoundFile: () => undefined,
        }

        assert.deepStrictEqual(
            Object.keys(rawJavaScriptEngine).sort(),
            Object.keys(modelRawEngine).sort()
        )
    })
})
