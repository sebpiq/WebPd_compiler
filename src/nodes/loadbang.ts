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

import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (_, { state }) => `
    let ${state('init')} = true
`

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { outs, state }) => {
    return `
        if (${state('init')}) {
            ${state('init')} = false
            ${outs('0')}.push(['bang'])
        }
    `
}
