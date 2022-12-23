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

import { DspGraph } from '@webpd/dsp-graph'
import { buildMessageTransferOperations } from '../compile-helpers'
import {
    MSG_DATUM_TYPE_FLOAT,
    MSG_DATUM_TYPE_STRING,
} from '../constants'
import {
    Code,
    CodeMacros,
    CodeVariableName,
    Compilation,
    Message,
    MessageDatumType,
} from '../types'

const typedVarInt = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarFloat = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarString = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarMessage = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarFloatArray = (_: Compilation, name: CodeVariableName) => `${name}`

const typedVarMessageArray = (_: Compilation, name: CodeVariableName) =>
    `${name}`

const typedVarStringArray = (_: Compilation, name: CodeVariableName) =>
    `${name}`

const castToInt = (_: Compilation, name: CodeVariableName) => `${name}`

const castToFloat = (_: Compilation, name: CodeVariableName) => `${name}`

const functionHeader = (_: Compilation, ...functionArgs: Array<Code>) =>
    `(${functionArgs.join(', ')})`

const createMessage = (
    _: Compilation,
    name: CodeVariableName,
    message: Message
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
        } else if (token === MSG_DATUM_TYPE_FLOAT) {
            return `typeof ${name}[${tokenIndex}] === "number"`
        } else if (token === MSG_DATUM_TYPE_STRING) {
            return `typeof ${name}[${tokenIndex}] === "string"`
        } else {
            throw new Error(`unexpected token ${token}`)
        }
    })
    return `(${[conditionOnLength, ...conditionsOnValues].join(' && ')})`
}

const extractMessageStringTokens = (
    _: Compilation,
    messageVariableName: CodeVariableName,
    destinationVariableName: CodeVariableName,
) => `
        const ${destinationVariableName} = []
        for (let i = 0; i < ${messageVariableName}.length; i++) {
            if (typeof ${messageVariableName}[i] === "string") {
                ${destinationVariableName}.push([
                    i, ${messageVariableName}[i]
                ])
            }
        }
    `

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

const fillInLoopInput = (
    compilation: Compilation,
    channel: number,
    destinationName: CodeVariableName
) => {
    const globs = compilation.engineVariableNames.g
    return `${destinationName} = ${globs.input}[${channel}][${globs.iterFrame}]`
}

const fillInLoopOutput = (
    compilation: Compilation,
    channel: number,
    sourceName: CodeVariableName
) => {
    const globs = compilation.engineVariableNames.g
    return `${globs.output}[${channel}][${globs.iterFrame}] = ${sourceName}`
}

const messageTransfer = (
    _: Compilation,
    template: Array<DspGraph.NodeArgument>,
    inVariableName: CodeVariableName,
    outVariableName: CodeVariableName
) => {
    const outElements: Array<Code> = []
    buildMessageTransferOperations(template).forEach((operation) => {
        if (operation.type === 'noop') {
            outElements.push(`${inVariableName}[${operation.inIndex}]`)
        } else if (operation.type === 'string-template') {
            outElements.push(
                `"${operation.template}"${operation.variables.map(
                    ({ placeholder, inIndex }) =>
                        `.replace("${placeholder}", ${inVariableName}[${inIndex}])`
                )}`
            )
        } else if (operation.type === 'string-constant') {
            outElements.push(`"${operation.value}"`)
        } else if (operation.type === 'float-constant') {
            outElements.push(`${operation.value}`)
        }
    })
    return `
        const ${outVariableName} = [${outElements.join(', ')}]
    `
}

const macros: CodeMacros = {
    typedVarInt,
    typedVarFloat,
    typedVarString,
    typedVarMessage,
    typedVarFloatArray,
    typedVarMessageArray,
    typedVarStringArray,
    castToInt,
    castToFloat,
    functionHeader,
    createMessage,
    isMessageMatching,
    extractMessageStringTokens,
    readMessageStringDatum,
    readMessageFloatDatum,
    fillInLoopInput,
    fillInLoopOutput,
    messageTransfer,
}

export default macros
