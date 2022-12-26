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

import { readFileSync } from 'fs'
import { renderTemplatedCode } from '../compile-helpers'
import { Code } from '../types'

interface JsSnippet {
    v: Array<number>
    s: Array<string>
}

// TODO : test only one string? 
export const renderTemplatedJs = (
    ascStrings: TemplateStringsArray,
    ...ascVariables: Array<string>
): Code => {
    const JS_SNIPPETS: {[snippetKey: string]: JsSnippet} = JSON.parse(
        readFileSync('/tmp/SNIPPETS.json').toString('utf8'))

    // Find the right compiled snippet
    const snippetKey = ascStrings.join('')
    if (!JS_SNIPPETS[snippetKey]) {
        throw new Error('unknown JS snippet')
    }
    const {v: jsVariablesIndexes, s: jsStrings} = JS_SNIPPETS[snippetKey]

    // Filter ascVariables to include only the relevant ones for the JS code
    const jsVariables = jsVariablesIndexes
        .map(index => ascVariables[index])

    // Render JS code
    return renderTemplatedCode(jsStrings, ...jsVariables)
}