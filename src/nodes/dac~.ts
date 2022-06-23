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
// TODO : args
export const setup: NodeCodeGenerator = () => ``

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (
    _,
    { ins, MACROS },
    { channelCount }
) => {
    let loopStr = ''
    for (let channel = 0; channel < channelCount; channel++) {
        loopStr += `\n${MACROS.fillInLoopOutput(channel, ins[`${channel}`])}`
    }
    return loopStr
}
