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

import { PdDspGraph } from '@webpd/dsp-graph'
import { NodeCodeGenerator } from '../types'

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (node, { ins, outs, macros }) => {
    const template = node.args.template as Array<PdDspGraph.NodeArgument>

    return `
        while (${ins.$0}.length) {
            const ${macros.typedVarMessage('inMessage')} = ${ins.$0}.shift()
            ${macros.messageTransfer(template, 'inMessage', 'outMessage')}
            ${outs.$0}.push(outMessage)
        }
    `
}
