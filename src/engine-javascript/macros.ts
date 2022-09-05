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

import { Compilation } from '../compilation'
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import { Code, CodeVariableName, MessageDatumType } from '../types'

const floatArrayType = (compilation: Compilation) => {
    const { bitDepth } = compilation.audioSettings
    return bitDepth === 32 ? 'Float32Array' : 'Float64Array'
}

const typedVarInt = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarFloat = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarString = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarMessage = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarFloatArray = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarMessageArray = (_: Compilation, name: CodeVariableName) =>
    `${name}`

const castToInt = (_: Compilation, name: CodeVariableName) => `${name}`

const castToFloat = (_: Compilation, name: CodeVariableName) => `${name}`

const functionHeader = (_: Compilation, ...functionArgs: Array<Code>) =>
    `(${functionArgs.join(', ')})`

const createMessage = (
    _: Compilation,
    name: CodeVariableName,
    message: PdSharedTypes.ControlValue
) => `const ${name} = ${JSON.stringify(message)}`

const isMessageMatching = (
    _: Compilation,
    name: CodeVariableName,
    tokens: Array<number | string | MessageDatumType>
): Code => {
    const conditionOnLength = `${name}.length === ${tokens.length}`
    const conditionsOnValues = tokens.map((token, tokenIndex) => {
        if (typeof token === 'number') {
            return `${name}[${tokenIndex}] === ${token}`
        } else if (typeof token === 'string') {
            return `${name}[${tokenIndex}] === "${token}"`
        } else if (token === MESSAGE_DATUM_TYPE_FLOAT) {
            return `typeof ${name}[${tokenIndex}] === "number"`
        } else if (token === MESSAGE_DATUM_TYPE_STRING) {
            return `typeof ${name}[${tokenIndex}] === "string"`
        } else {
            throw new Error(`unexpected token ${token}`)
        }
    })
    return `(${[conditionOnLength, ...conditionsOnValues].join(' && ')})`
}

const readMessageStringDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number
) => `${name}[${tokenIndex}]`

const readMessageFloatDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number
) => `${name}[${tokenIndex}]`

const fillInLoopOutput = (
    compilation: Compilation,
    channel: number,
    value: CodeVariableName
) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${channel}][${globs.iterFrame}] = ${value}`
}

const MACROS = {
    floatArrayType,
    typedVarInt,
    typedVarFloat,
    typedVarString,
    typedVarMessage,
    typedVarFloatArray,
    typedVarMessageArray,
    castToInt,
    castToFloat,
    functionHeader,
    createMessage,
    isMessageMatching,
    readMessageStringDatum,
    readMessageFloatDatum,
    fillInLoopOutput,
}

export default MACROS
