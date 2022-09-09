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

import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { NodeCodeGenerator, NodeImplementation } from '../types'

// ------------------------------ declare ------------------------------ //
export const declare: NodeCodeGenerator = (
    _,
    { state, ins, globs, macros }
) => `
    let ${macros.typedVarFloatArray(state.array)}
    let ${macros.typedVarInt(state.readPosition)}
    let ${macros.typedVarInt(state.readUntil)}

    const ${state.funcSetArrayName} = ${macros.functionHeader(
    macros.typedVarString('arrayName')
)} => {
        if (!${globs.arrays}.has(arrayName)) {
            ${state.array} = new ${macros.floatArrayType()}(0)
        } else {
            ${state.array} = ${globs.arrays}.get(arrayName)
        }
        ${state.readPosition} = ${state.array}.length
        ${state.readUntil} = ${state.array}.length
    }

    const ${state.funcHandleMessage} = ${macros.functionHeader()} => {
        let ${macros.typedVarMessage('m')} = ${ins.$0}.shift()
        
        if (${macros.isMessageMatching('m', [
            'set',
            MESSAGE_DATUM_TYPE_STRING,
        ])}) {
            ${state.funcSetArrayName}(${macros.readMessageStringDatum('m', 1)})
            
        } else if (${macros.isMessageMatching('m', ['bang'])}) {
            ${state.readPosition} = 0
            ${state.readUntil} = ${state.array}.length
            
        } else if (${macros.isMessageMatching('m', [
            MESSAGE_DATUM_TYPE_FLOAT,
        ])}) {
            ${state.readPosition} = ${macros.castToInt(
    macros.readMessageFloatDatum('m', 0)
)}
            ${state.readUntil} = ${state.array}.length
    
        } else if (${macros.isMessageMatching('m', [
            MESSAGE_DATUM_TYPE_FLOAT,
            MESSAGE_DATUM_TYPE_FLOAT,
        ])}) {
            ${state.readPosition} = ${macros.castToInt(
    macros.readMessageFloatDatum('m', 0)
)}
            ${state.readUntil} = ${macros.castToInt(`Math.min(
                ${macros.castToFloat(
                    state.readPosition
                )} + ${macros.readMessageFloatDatum('m', 1)}, 
                ${macros.castToFloat(`${state.array}.length`)}
            )`)}
            
        } else {
            throw new Error("Unexpected message")
        }
    }
`

// ------------------------------ initialize ------------------------------ //
export const initialize: NodeCodeGenerator = (node, { state, ins, macros }) => `
    ${state.array} = new ${macros.floatArrayType()}(0)
    ${state.readPosition} = 0
    ${state.readUntil} = 0

    ${
        node.args.arrayName
            ? `{
        ${macros.createMessage('m', ['set', node.args.arrayName as string])}
        ${ins.$0}.push(m)
    }`
            : ''
    }
`

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs, macros }) => `
    while (${ins.$0}.length) {
        ${state.funcHandleMessage}()
    }

    if (${state.readPosition} < ${state.readUntil}) {
        ${outs.$0} = ${state.array}[${state.readPosition}]
        ${state.readPosition}++
        if (${state.readPosition} >= ${state.readUntil}) {
            ${macros.createMessage('m', ['bang'])}
            ${outs.$1}.push(m)
        }
    } else {
        ${outs.$0} = 0
    }
`

// ------------------------------------------------------------------- //
export const stateVariables: NodeImplementation['stateVariables'] = [
    'array',
    'readPosition',
    'readUntil',
    'funcSetArrayName',
    'funcPlay',
    'funcHandleMessage',
]
