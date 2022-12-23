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
import { buildMessageTransferOperations, renderCode } from '../compile-helpers'
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
import { MSG_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'

const ASC_MSG_FLOAT_TOKEN = MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_FLOAT]
const ASC_MSG_STRING_TOKEN = MSG_DATUM_TYPES_ASSEMBLYSCRIPT[MSG_DATUM_TYPE_STRING]

const typedVarInt = (_: Compilation, name: CodeVariableName) => `${name}: i32`

const typedVarFloat = (
    { engineVariableNames }: Compilation,
    name: CodeVariableName
) => {
    return `${name}: ${engineVariableNames.types.FloatType}`
}

const typedVarString = (_: Compilation, name: CodeVariableName) =>
    `${name}: string`

const typedVarMessage = (_: Compilation, name: CodeVariableName) =>
    `${name}: Message`

const typedVarFloatArray = (
    { engineVariableNames }: Compilation,
    name: CodeVariableName
) => `${name}: ${engineVariableNames.types.FloatArrayType}`

const typedVarMessageArray = (_: Compilation, name: CodeVariableName) =>
    `${name}: Message[]`

const typedVarStringArray = (_: Compilation, name: CodeVariableName) =>
    `${name}: string[]`

const castToInt = (_: Compilation, name: CodeVariableName) => `i32(${name})`

const castToFloat = (
    { engineVariableNames }: Compilation,
    name: CodeVariableName
) => {
    return `${engineVariableNames.types.FloatType}(${name})`
}

const functionHeader = (_: Compilation, ...functionArgs: Array<Code>) =>
    `(${functionArgs.join(', ')}): void`

const createMessage = (
    _: Compilation,
    name: CodeVariableName,
    message: Message
) => {
    return renderCode`
        const ${name}: Message = Message.fromTemplate([${message
        .reduce((template, value) => {
            if (typeof value === 'number') {
                return [
                    ...template,
                    ASC_MSG_FLOAT_TOKEN,
                ]
            } else if (typeof value === 'string') {
                return [
                    ...template,
                    ASC_MSG_STRING_TOKEN,
                    value.length,
                ]
            } else {
                throw new Error(`invalid value for message : ${value}`)
            }
        }, [] as Array<number>)
        .join(', ')}])

        ${message.map((value, datumIndex) => {
            if (typeof value === 'number') {
                return `msg_writeFloatDatum(${name}, ${datumIndex}, ${value.toString(
                    10
                )})`
            } else if (typeof value === 'string') {
                return `msg_writeStringDatum(${name}, ${datumIndex}, "${value}")`
            } else {
                throw new Error(`invalid value for message : ${value}`)
            }
        })}
    `
}

const isMessageMatching = (
    compilation: Compilation,
    name: CodeVariableName,
    tokens: Array<number | string | MessageDatumType>
) => {
    const macros = compilation.macros
    const conditionOnDatumCount = `${name}.datumCount === ${tokens.length}`
    const conditionsOnValues: Array<Code> = []
    const conditionsOnTypes: Array<Code> = tokens.map((token, tokenIndex) => {
        if (typeof token === 'number' || token === MSG_DATUM_TYPE_FLOAT) {
            if (typeof token === 'number') {
                conditionsOnValues.push(
                    `${macros.readMessageFloatDatum(
                        compilation,
                        name,
                        tokenIndex
                    )} === ${token}`
                )
            }
            return `${name}.datumTypes[${tokenIndex}] === ${ASC_MSG_FLOAT_TOKEN}`
        } else if (
            typeof token === 'string' ||
            token === MSG_DATUM_TYPE_STRING
        ) {
            if (typeof token === 'string') {
                conditionsOnValues.push(
                    `${macros.readMessageStringDatum(
                        compilation,
                        name,
                        tokenIndex
                    )} === "${token}"`
                )
            }
            return `${name}.datumTypes[${tokenIndex}] === ${ASC_MSG_STRING_TOKEN}`
        } else {
            throw new Error(`unexpected token ${token}`)
        }
    })

    // !!! Conditions on message template must appear before conditions on values,
    // because the conditions on values assume a specific a type for the value they are testing
    return `(${[
        conditionOnDatumCount,
        ...conditionsOnTypes,
        ...conditionsOnValues,
    ].join(' && ')})`
}

const extractMessageStringTokens = (
    compilation: Compilation,
    messageVariableName: CodeVariableName,
    destinationVariableName: CodeVariableName,
) => {
    const {macros} = compilation
    return `
        const ${destinationVariableName}: Array<Array<string>> = []
        for (let i = 0; i < ${messageVariableName}.datumCount; i++) {
            if (${messageVariableName}.datumTypes[i] === ${ASC_MSG_STRING_TOKEN}) {
                ${destinationVariableName}.push([
                    i.toString(), ${macros.readMessageStringDatum(compilation, messageVariableName, 'i')}
                ])
            }
        }
    `
}

const readMessageStringDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number | CodeVariableName
) => `msg_readStringDatum(${name}, ${tokenIndex})`

const readMessageFloatDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number | CodeVariableName
) => `msg_readFloatDatum(${name}, ${tokenIndex})`

const fillInLoopInput = (
    compilation: Compilation,
    channel: number,
    destinationName: CodeVariableName
) => {
    const globs = compilation.engineVariableNames.g
    return `${destinationName} = ${globs.input}[${globs.iterFrame} + ${globs.blockSize} * ${channel}]`
}

const fillInLoopOutput = (
    compilation: Compilation,
    channel: number,
    sourceName: CodeVariableName
) => {
    const globs = compilation.engineVariableNames.g
    return `${globs.output}[${globs.iterFrame} + ${globs.blockSize} * ${channel}] = ${sourceName}`
}

const messageTransfer = (
    _: Compilation,
    template: Array<DspGraph.NodeArgument>,
    inVariableName: CodeVariableName,
    outVariableName: CodeVariableName
) => {
    const outMessageTemplateCode: Array<string> = []
    const outMessageSetCode: Array<string> = []
    let stringMemCount = 0

    buildMessageTransferOperations(template).forEach((operation, outIndex) => {
        if (operation.type === 'noop') {
            const { inIndex } = operation
            // prettier-ignore
            outMessageTemplateCode.push(`
                outTemplate.push(${inVariableName}.datumTypes[${inIndex}])
                if (${inVariableName}.datumTypes[${inIndex}] === ${ASC_MSG_STRING_TOKEN}) {
                    const stringDatum: string = msg_readStringDatum(${inVariableName}, ${inIndex})
                    stringMem[${stringMemCount}] = stringDatum
                    outTemplate.push(stringDatum.length)
                }
            `)
            // prettier-ignore
            outMessageSetCode.push(`
                if (${inVariableName}.datumTypes[${inIndex}] === ${ASC_MSG_FLOAT_TOKEN}) {
                    msg_writeFloatDatum(outMessage, ${outIndex}, msg_readFloatDatum(${inVariableName}, ${inIndex}))
                } else if (${inVariableName}.datumTypes[${inIndex}] === ${ASC_MSG_STRING_TOKEN}) {
                    msg_writeStringDatum(outMessage, ${outIndex}, stringMem[${stringMemCount}])
                }
            `)
            stringMemCount++
        } else if (operation.type === 'string-template') {
            // prettier-ignore
            outMessageTemplateCode.push(`
                let stringDatum: string = "${operation.template}"
                ${operation.variables.map(({placeholder, inIndex}) => `
                    if (${inVariableName}.datumTypes[${inIndex}] === ${ASC_MSG_FLOAT_TOKEN}) {
                        let value: string = msg_readFloatDatum(${inVariableName}, ${inIndex}).toString()
                        if (value.endsWith('.0')) {
                            value = value.slice(0, -2)
                        }
                        stringDatum = stringDatum.replace("${placeholder}", value)
                    } else if (${inVariableName}.datumTypes[${inIndex}] === ${ASC_MSG_STRING_TOKEN}) {
                        stringDatum = stringDatum.replace("${placeholder}", msg_readStringDatum(${inVariableName}, ${inIndex}))
                    }`
                )}
                stringMem[${stringMemCount}] = stringDatum
                outTemplate.push(${ASC_MSG_STRING_TOKEN})
                outTemplate.push(stringDatum.length)
            `)
            outMessageSetCode.push(`
                msg_writeStringDatum(outMessage, ${outIndex}, stringMem[${stringMemCount}])
            `)
            stringMemCount++
        } else if (operation.type === 'string-constant') {
            // prettier-ignore
            outMessageTemplateCode.push(`
                outTemplate.push(${ASC_MSG_STRING_TOKEN})
                outTemplate.push(${operation.value.length})
            `)

            outMessageSetCode.push(`
                msg_writeStringDatum(outMessage, ${outIndex}, "${operation.value}")
            `)
        } else if (operation.type === 'float-constant') {
            outMessageTemplateCode.push(`
                outTemplate.push(${ASC_MSG_FLOAT_TOKEN})
            `)

            outMessageSetCode.push(`
                msg_writeFloatDatum(outMessage, ${outIndex}, ${operation.value})
            `)
        }
    })

    // Put local variables in a block to avoid polluting global space.
    // prettier-ignore
    return renderCode`
        let ${outVariableName}: Message
        {
            const stringMem: Array<string> = new Array<string>(${stringMemCount.toString()})
            const outTemplate: MessageTemplate = []
            ${outMessageTemplateCode}
            
            ${outVariableName} = Message.fromTemplate(outTemplate)
            ${outMessageSetCode}
        }
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
