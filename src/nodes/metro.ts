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

import { MESSAGE_DATUM_TYPE_FLOAT } from '../constants'
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
        let ${MACROS.typedVarFloat(state.rate)} = 0
        let ${MACROS.typedVarInt(state.nextTick)} = -1
        let ${MACROS.typedVarFloat(state.realNextTick)} = -1

        const ${state.funcSetRate} = ${MACROS.functionHeader(
            MACROS.typedVarFloat('rate')
        )} => {
            ${state.rate} = rate / 1000 * ${sampleRate}
        }

        const ${state.funcHandleMessage0} = ${MACROS.functionHeader()} => {
            let m = ${ins.$0}.shift()
            if (${MACROS.isMessageMatching('m', [0])} || ${MACROS.isMessageMatching('m', ['stop'])}) {
                ${state.nextTick} = 0
                ${state.realNextTick} = 0
                
            } else if (${MACROS.isMessageMatching('m', [MESSAGE_DATUM_TYPE_FLOAT])} || ${MACROS.isMessageMatching('m', ['bang'])}) {
                ${state.nextTick} = ${globs.frame}
                ${state.realNextTick} = ${MACROS.castToFloat(globs.frame)}
        
            } else {
                throw new Error("Unexpected message")
            }
        }

        const ${state.funcHandleMessage1} = ${MACROS.functionHeader()} => {
            let m = ${ins.$1}.shift()
            if (${MACROS.isMessageMatching('m', [MESSAGE_DATUM_TYPE_FLOAT])}) {
                ${state.funcSetRate}(${MACROS.readMessageFloatDatum('m', 0)})
                
            } else {
                throw new Error("Unexpected message")
            }
        }

        ${args.rate !== undefined ? 
            `${state.funcSetRate}(${args.rate})`: ''}
    `

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs, globs, MACROS }) => `
    while (${ins.$1}.length) {
        ${state.funcHandleMessage1}()
    }
    while (${ins.$0}.length) {
        ${state.funcHandleMessage0}()
    }
    if (${globs.frame} === ${state.nextTick}) {
        ${MACROS.createMessage('m', ['bang'])}
        ${outs.$0}.push(m)
        ${state.realNextTick} = ${state.realNextTick} + ${state.rate}
        ${state.nextTick} = ${MACROS.castToInt(`Math.round(${state.realNextTick})`)}
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
