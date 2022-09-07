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

// TODO : left inlet ?
// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { outs, macros }) => {
    return `
        ${outs.$0} = ${macros.castToFloat(`Math.random() * 2 - 1`)}
    `
}
