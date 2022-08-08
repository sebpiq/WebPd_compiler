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

import assert from "assert"
import compile from "./compile"
import { CompilerSettings } from "./types"

describe('compile', () => {

    const COMPILER_SETTINGS_AS: CompilerSettings = {
        channelCount: 2,
        bitDepth: 32,
        target: 'assemblyscript',
    }

    const COMPILER_SETTINGS_JS: CompilerSettings = {
        channelCount: 2,
        bitDepth: 32,
        target: 'javascript',
    }
    
    it('should compile assemblyscript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_AS)
        assert.strictEqual(typeof code, 'string')
    })

        
    it('should compile javascript without error', () => {
        const code = compile({}, {}, COMPILER_SETTINGS_JS)
        assert.strictEqual(typeof code, 'string')
    })
})
