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

import { renderCode } from "../code-helpers"
import { Compilation } from "../compilation"
import { MESSAGE_DATUM_TYPE, MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING } from "../engine-common"
import { AssemblyScriptCompilerSettingsWithDefaults, Code, CodeVariableName } from "../types"
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from "./bindings"

const floatArrayType = (compilation: Compilation) => {
    const {bitDepth} = compilation.settings
    return bitDepth === 32 ? 'Float32Array' : 'Float64Array'
}

const typedVarInt = (_: Compilation, name: CodeVariableName) => 
    `${name}: i32`

const typedVarFloat = (compilation: Compilation, name: CodeVariableName) => {
    const settings = compilation.settings as AssemblyScriptCompilerSettingsWithDefaults
    return `${name}: f${settings.bitDepth}`
}

const typedVarString = (_: Compilation, name: CodeVariableName) => 
    `${name}: string`

const typedVarMessage = (_: Compilation, name: CodeVariableName) => 
    `${name}: Messsage`

const typedVarFloatArray = (compilation: Compilation, name: CodeVariableName) => 
    `${name}: ${compilation.getMacros().floatArrayType()}`

const typedVarMessageArray = (_: Compilation, name: CodeVariableName) => 
    `${name}: Message`

const createMessage = (_: Compilation, name: CodeVariableName, message: PdSharedTypes.ControlValue) => {
    return renderCode`
        const ${name}: Message = Message.fromTemplate(${message.map(value => {
            if (typeof value === 'number') {
                return MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]
            } else if (typeof value === 'number') {
                return MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]
            } else {
                throw new Error(`invalid value for message : ${value}`)
            }
        }).join(', ')})

        ${message.map((value, datumIndex) => {
            if (typeof value === 'number') {
                return `writeFloatDatum(${name}, ${datumIndex}, ${value.toString(10)})`
            } else if (typeof value === 'number') {
                return `writeStringDatum(${name}, ${datumIndex}, ${value})`
            } else {
                throw new Error(`invalid value for message : ${value}`)
            }
        })}
    `
}

const isMessageMatching = (
    compilation: Compilation, name: CodeVariableName, 
    tokens: Array<number | string | MESSAGE_DATUM_TYPE>
) => {
    const MACROS = compilation.getMacros()
    const conditionsOnValues: Array<Code> = []
    const conditionsOnTypes: Array<Code> = tokens.map((token, tokenIndex) => {
        if (typeof token === 'number' || token === MESSAGE_DATUM_TYPE_FLOAT) {
            if (typeof token === 'number') {
                conditionsOnValues.push(`${MACROS.readMessageFloatDatum(name, tokenIndex)} === ${token}`)
            }
            return `${name}.datumTypes[${tokenIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}`
        } else if (typeof token === 'string' || token === MESSAGE_DATUM_TYPE_STRING) {
            if (typeof token === 'string') {
                conditionsOnValues.push(`${MACROS.readMessageStringDatum(name, tokenIndex)} === "${token}"`)
            }
            return `${name}.datumTypes[${tokenIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}`
        } else {
            throw new Error(`unexpected token ${token}`)
        }
    })

    // !!! Conditions on message template must appear before conditions on values,
    // because the conditions on values assume a specific a type for the value they are testing
    return `(${[...conditionsOnTypes, ...conditionsOnValues].join(' && ')})`
}

const readMessageStringDatum = (
    _: Compilation, 
    name: CodeVariableName, 
    tokenIndex: number
) => 
    `readStringDatum(${name}, ${tokenIndex})`

const readMessageFloatDatum = (
    _: Compilation, 
    name: CodeVariableName, 
    tokenIndex: number
) => 
    `readFloatDatum(${name}, ${tokenIndex})`

const fillInLoopOutput = (compilation: Compilation, channel: number, value: CodeVariableName) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${globs.iterFrame} + ${globs.blockSize} * ${channel}] = ${value}`
}

const MACROS = {
    floatArrayType,
    typedVarInt,
    typedVarFloat,
    typedVarString,
    typedVarMessage,
    typedVarFloatArray,
    typedVarMessageArray,
    createMessage,
    isMessageMatching,
    readMessageStringDatum,
    readMessageFloatDatum,
    fillInLoopOutput,
}

export default MACROS