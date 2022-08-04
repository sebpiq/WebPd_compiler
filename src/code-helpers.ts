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

import { Code } from './types'

type CodeLines = Array<CodeLines | Code>

/**
 * Helper to render code. 
 * Allows to pass templated strings with arrays and arrays of arrays of codelines, adding new lines automatically.
 * @param strings 
 * @param codeLines 
 * @returns 
 */
export const renderCode = (
    strings: TemplateStringsArray,
    ...codeLines: CodeLines
): Code => {
    let rendered: string = ''
    for (let i = 0; i < strings.length; i++) {
        rendered += strings[i]
        if (codeLines[i]) {
            rendered += renderCodeLines(codeLines[i])
        }
    }
    return rendered
}

const renderCodeLines = (codeLines: CodeLines | Code): Code => {
    if (Array.isArray(codeLines)) {
        return codeLines.map(renderCodeLines).join('\n')
    }
    return codeLines
}

export const createNamespace = <T extends Object>(namespace: T) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = String(k)
            if (!target.hasOwnProperty(key)) {
                if (key[0] === '$' && target.hasOwnProperty(key.slice(1))) {
                    return (target as any)[key.slice(1)]
                }

                // Whitelist some fields that are undefined but accessed at
                // some point or another by our code.
                if (['toJSON'].includes(key)) {
                    return undefined
                }
                throw new Error(`Namespace doesn't know key "${String(key)}"`)
            }
            return (target as any)[key]
        },
    })
}
