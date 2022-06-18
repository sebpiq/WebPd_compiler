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
export const setup: NodeCodeGenerator = (
    node,
    { state, ins },
    { variableNames }
) => `
    let ${state('array')} = new Float32Array(0)
    let ${state('readPosition')} = 0
    let ${state('readUntil')} = 0

    const ${state('funcSetArrayName')} = (arrayName) => {
        ${state('array')} = ${
    variableNames.arrays
}[arrayName] || new Float32Array(0)
        ${state('readPosition')} = ${state('array')}.length
        ${state('readUntil')} = ${state('array')}.length
    }

    const ${state('funcPlay')} = (startPosition, sampleCount) => {
        ${state('readPosition')} = startPosition
        ${state('readUntil')} = sampleCount !== undefined ? 
            Math.min(startPosition + sampleCount, ${state('array')}.length) 
            : ${state('array')}.length
    }

    const ${state('funcHandleMessage')} = () => {
        let inMessage = ${ins('0')}.shift()
        if (inMessage.length === 0) {

        } else if (inMessage[0] === 'set') {
            ${state('funcSetArrayName')}(inMessage[1])
            
        } else if (inMessage[0] === 'bang') {
            ${state('funcPlay')}(0)
    
        } else if (inMessage.length === 1) {
            ${state('funcPlay')}(inMessage[0])
    
        } else if (inMessage.length === 2) {
            ${state('funcPlay')}(inMessage[0], inMessage[1])
            
        } else {
            // TODO : error handling
        }
    }

    ${state('funcSetArrayName')}("${node.args.arrayName}")
`

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs }) => `
    while (${ins('0')}.length) {
        ${state('funcHandleMessage')}()
    }

    if (${state('readPosition')} < ${state('readUntil')}) {
        ${outs('0')} = ${state('array')}[${state('readPosition')}]
        ${state('readPosition')}++
        if (${state('readPosition')} >= ${state('readUntil')}) {
            ${outs('1')}.push(['bang'])
        }
    } else {
        ${outs('0')} = 0
    }
`
