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

import { MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from '../engine-common'
import { NodeCodeGenerator, NodeImplementation } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (node, { state, ins, globs, MACROS }) => `
    let ${MACROS.typedVarFloatArray(state.array)} = new ${MACROS.floatArrayType}(0)
    let ${MACROS.typedVarInt(state.readPosition)} = 0
    let ${MACROS.typedVarInt(state.readUntil)} = 0

    const ${state.funcSetArrayName} = (
        ${MACROS.typedVarString('arrayName')}
    ) => {
        ${state.array} = ${globs.arrays}[arrayName] || new Float32Array(0)
        ${state.readPosition} = ${state.array}.length
        ${state.readUntil} = ${state.array}.length
    }

    const ${state.funcHandleMessage} = () => {
        let ${MACROS.typedVarMessage('inMessage')} = ${ins.$0}.shift()
        if (${MACROS.isMessageMatching('inMessage', ['set', MESSAGE_DATUM_TYPE_STRING])}) {
            ${state.funcSetArrayName}(${MACROS.readMessageStringDatum('inMessage', 1)})
            
        } else if (${MACROS.isMessageMatching('inMessage', ['bang'])}) {
            ${state.readPosition} = 0
            ${state.readUntil} = ${state.array}.length
            
        } else if (${MACROS.isMessageMatching('inMessage', [MESSAGE_DATUM_TYPE_FLOAT])}) {
            ${state.readPosition} = ${MACROS.readMessageFloatDatum('inMessage', 0)}
            ${state.readUntil} = Math.min(startPosition + sampleCount, ${state.array}.length)
    
        } else if (${MACROS.isMessageMatching('inMessage', [MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_FLOAT])}) {
            ${state.readPosition} = ${MACROS.readMessageFloatDatum('inMessage', 0)}
            ${state.readUntil} = ${MACROS.readMessageFloatDatum('inMessage', 1)}
            
        } else {
            throw new Error("Unexpected message")
        }
    }

    ${state.funcSetArrayName}("${node.args.arrayName}")
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
