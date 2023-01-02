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
            readSoundFileResponse: () => undefined,
            onRequestReadSoundFile: () => undefined,
        }

        const modelEngine: JavaScriptEngine = {
            configure: (_: number) => {},
            loop: () => new Float32Array(),
            setArray: () => undefined,
            accessors: {},
            fs: modelFs,
            inletListeners: {}
        }

        assert.deepStrictEqual(Object.keys(engine).sort(), Object.keys(modelEngine).sort())
        assert.deepStrictEqual(Object.keys(engine.fs).sort(), Object.keys(modelFs).sort())
    })
})
