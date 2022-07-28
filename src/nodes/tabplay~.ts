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

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (
    node,
    { state, ins, globs, MACROS }
) => `
    let ${MACROS.typedVarFloatArray(
        state.array
    )} = new ${MACROS.floatArrayType()}(0)
    let ${MACROS.typedVarInt(state.readPosition)} = 0
    let ${MACROS.typedVarInt(state.readUntil)} = 0

    const ${state.funcSetArrayName} = ${MACROS.functionHeader(
    MACROS.typedVarString('arrayName')
)} => {
        if (!${globs.arrays}.has(arrayName)) {
            ${state.array} = new Float32Array(0)
        } else {
            ${state.array} = ${globs.arrays}.get(arrayName)
        }
        ${state.readPosition} = ${state.array}.length
        ${state.readUntil} = ${state.array}.length
    }

    const ${state.funcHandleMessage} = ${MACROS.functionHeader()} => {
        let ${MACROS.typedVarMessage('m')} = ${ins.$0}.shift()
        
        if (${MACROS.isMessageMatching('m', [
            'set',
            MESSAGE_DATUM_TYPE_STRING,
        ])}) {
            ${state.funcSetArrayName}(${MACROS.readMessageStringDatum('m', 1)})
            
        } else if (${MACROS.isMessageMatching('m', ['bang'])}) {
            ${state.readPosition} = 0
            ${state.readUntil} = ${state.array}.length
            
        } else if (${MACROS.isMessageMatching('m', [
            MESSAGE_DATUM_TYPE_FLOAT,
        ])}) {
            ${state.readPosition} = ${MACROS.castToInt(
    MACROS.readMessageFloatDatum('m', 0)
)}
            ${state.readUntil} = ${state.array}.length
    
        } else if (${MACROS.isMessageMatching('m', [
            MESSAGE_DATUM_TYPE_FLOAT,
            MESSAGE_DATUM_TYPE_FLOAT,
        ])}) {
            ${state.readPosition} = ${MACROS.castToInt(
    MACROS.readMessageFloatDatum('m', 0)
)}
            ${state.readUntil} = ${MACROS.castToInt(`Math.min(
                ${MACROS.castToFloat(
                    state.readPosition
                )} + ${MACROS.readMessageFloatDatum('m', 1)}, 
                ${MACROS.castToFloat(`${state.array}.length`)}
            )`)}
            
        } else {
            throw new Error("Unexpected message")
        }
    }

    ${
        node.args.arrayName
            ? `{
        ${MACROS.createMessage('m', ['set', node.args.arrayName as string])}
        ${ins.$0}.push(m)
    }`
            : ''
    }
`

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs, MACROS }) => `
    while (${ins.$0}.length) {
        ${state.funcHandleMessage}()
    }

    if (${state.readPosition} < ${state.readUntil}) {
        ${outs.$0} = ${state.array}[${state.readPosition}]
        ${state.readPosition}++
        if (${state.readPosition} >= ${state.readUntil}) {
            ${MACROS.createMessage('m', ['bang'])}
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
