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

import { NodeCodeGenerator, NodeImplementation } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (
    { args },
    { state, ins, globs, MACROS },
    { sampleRate }
) =>
    // TODO : more complex ways to set rate
    // Time units are all expressed in frames here
    `
        ${MACROS.declareFloat(state.rate, 0)}
        ${MACROS.declareFloat(state.nextTick, -1)}
        ${MACROS.declareFloat(state.realNextTick, -1)}

        const ${state.funcSetRate} = (rate) => {
            ${state.rate} = rate / 1000 * ${sampleRate}
        }

        const ${state.funcHandleMessage0} = () => {
            let inMessage = ${ins.$0}.shift()
            if (inMessage.length === 0) {

            } else if (inMessage[0] === 0 || inMessage[0] === 'stop') {
                ${state.nextTick} = 0
                ${state.realNextTick} = 0
                
            } else if (isNumber(inMessage[0]) || inMessage[0] === 'bang') {
                ${state.nextTick} = ${globs.frame}
                ${state.realNextTick} = ${globs.frame}
        
            } else {
                // TODO : error handling
            }
        }

        const ${state.funcHandleMessage1} = () => {
            let inMessage = ${ins.$1}.shift()
            if (inMessage.length === 1 && isNumber(inMessage[0])) {
                ${state.funcSetRate}(inMessage[0])
                
            } else {
                // TODO : error handling
            }
        }

        ${args.rate !== undefined ? 
            `${state.funcSetRate}(${args.rate})`: ''}
    `

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs, globs }) => `
    while (${ins.$1}.length) {
        ${state.funcHandleMessage1}()
    }
    while (${ins.$0}.length) {
        ${state.funcHandleMessage0}()
    }
    if (${globs.frame} === ${state.nextTick}) {
        ${outs.$0}.push(['bang'])
        ${state.realNextTick} = ${state.realNextTick} + ${state.rate}
        ${state.nextTick} = Math.round(${state.realNextTick})
    }
`

// ------------------------------------------------------------------- //
export const stateVariables: NodeImplementation['stateVariables'] = [
    'rate',
    'nextTick',
    'realNextTick',
    'funcSetRate',
    'funcHandleMessage0',
    'funcHandleMessage1',
]
