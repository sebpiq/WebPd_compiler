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

// ------------------------------ declare ------------------------------ //
export const declare: NodeCodeGenerator = (_, { state, ins, globs, macros }) =>
    // TODO : more complex ways to set rate
    // Time units are all expressed in frames here
    `
        let ${macros.typedVarFloat(state.rate)}
        let ${macros.typedVarInt(state.nextTick)}
        let ${macros.typedVarFloat(state.realNextTick)}

        const ${state.funcSetRate} = ${macros.functionHeader(
        macros.typedVarFloat('rate')
    )} => {
            ${state.rate} = rate / 1000 * ${globs.sampleRate}
        }

        const ${state.funcHandleMessage0} = ${macros.functionHeader()} => {
            let m = ${ins.$0}.shift()
            if (${macros.isMessageMatching('m', [
                0,
            ])} || ${macros.isMessageMatching('m', ['stop'])}) {
                ${state.nextTick} = 0
                ${state.realNextTick} = 0
                
            } else if (${macros.isMessageMatching('m', [
                MESSAGE_DATUM_TYPE_FLOAT,
            ])} || ${macros.isMessageMatching('m', ['bang'])}) {
                ${state.nextTick} = ${globs.frame}
                ${state.realNextTick} = ${macros.castToFloat(globs.frame)}
        
            } else {
                throw new Error("Unexpected message")
            }
        }

        const ${state.funcHandleMessage1} = ${macros.functionHeader()} => {
            let m = ${ins.$1}.shift()
            if (${macros.isMessageMatching('m', [MESSAGE_DATUM_TYPE_FLOAT])}) {
                ${state.funcSetRate}(${macros.readMessageFloatDatum('m', 0)})
                
            } else {
                throw new Error("Unexpected message")
            }
        }
    `

// ------------------------------ initialize ------------------------------ //
export const initialize: NodeCodeGenerator = ({ args }, { state }) =>
    `
        ${state.rate} = 0
        ${state.nextTick} = -1
        ${state.realNextTick} = -1
        ${args.rate !== undefined ? `${state.funcSetRate}(${args.rate})` : ''}
    `

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (
    _,
    { state, ins, outs, globs, macros }
) => `
    while (${ins.$1}.length) {
        ${state.funcHandleMessage1}()
    }
    while (${ins.$0}.length) {
        ${state.funcHandleMessage0}()
    }
    if (${globs.frame} === ${state.nextTick}) {
        ${macros.createMessage('m', ['bang'])}
        ${outs.$0}.push(m)
        ${state.realNextTick} = ${state.realNextTick} + ${state.rate}
        ${state.nextTick} = ${macros.castToInt(
    `Math.round(${state.realNextTick})`
)}
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
