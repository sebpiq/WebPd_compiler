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

// ------------------------------ initialize ------------------------------ //
// TODO : args


// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (
    _,
    { ins, macros },
    { audioSettings }
) => {
    let loopStr = ''
    for (let channel = 0; channel < audioSettings.channelCount; channel++) {
        loopStr += `\n${macros.fillInLoopOutput(channel, ins[`${channel}`])}`
    }
    return loopStr
}
