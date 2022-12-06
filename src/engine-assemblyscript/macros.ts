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

import { buildMessageTransferOperations, renderCode } from '../compile-helpers'
import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../constants'
import {
    Code,
    CodeMacros,
    CodeVariableName,
    Compilation,
    Message,
    MessageDatumType,
} from '../types'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from './constants'

const floatArrayType = (compilation: Compilation) => {
    const { bitDepth } = compilation.audioSettings
    return bitDepth === 32 ? 'Float32Array' : 'Float64Array'
}

const typedVarInt = (_: Compilation, name: CodeVariableName) => `${name}: i32`

const typedVarFloat = (compilation: Compilation, name: CodeVariableName) => {
    const { bitDepth } = compilation.audioSettings
    return `${name}: f${bitDepth}`
}

const typedVarString = (_: Compilation, name: CodeVariableName) =>
    `${name}: string`

const typedVarMessage = (_: Compilation, name: CodeVariableName) =>
    `${name}: Message`

const typedVarFloatArray = (compilation: Compilation, name: CodeVariableName) =>
    `${name}: ${compilation.macros.floatArrayType(compilation)}`

const typedVarMessageArray = (_: Compilation, name: CodeVariableName) =>
    `${name}: Message[]`

const castToInt = (_: Compilation, name: CodeVariableName) => `i32(${name})`

const castToFloat = (compilation: Compilation, name: CodeVariableName) => {
    const { bitDepth } = compilation.audioSettings
    return bitDepth === 32 ? `f32(${name})` : `f64(${name})`
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
                    MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                        MESSAGE_DATUM_TYPE_FLOAT
                    ],
                ]
            } else if (typeof value === 'string') {
                return [
                    ...template,
                    MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                        MESSAGE_DATUM_TYPE_STRING
                    ],
                    value.length,
                ]
            } else {
                throw new Error(`invalid value for message : ${value}`)
            }
        }, [] as Array<number>)
        .join(', ')}])

        ${message.map((value, datumIndex) => {
            if (typeof value === 'number') {
                return `writeFloatDatum(${name}, ${datumIndex}, ${value.toString(
                    10
                )})`
            } else if (typeof value === 'string') {
                return `writeStringDatum(${name}, ${datumIndex}, "${value}")`
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
        if (typeof token === 'number' || token === MESSAGE_DATUM_TYPE_FLOAT) {
            if (typeof token === 'number') {
                conditionsOnValues.push(
                    `${macros.readMessageFloatDatum(
                        compilation,
                        name,
                        tokenIndex
                    )} === ${token}`
                )
            }
            return `${name}.datumTypes[${tokenIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}`
        } else if (
            typeof token === 'string' ||
            token === MESSAGE_DATUM_TYPE_STRING
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
            return `${name}.datumTypes[${tokenIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}`
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

const readMessageStringDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number
) => `readStringDatum(${name}, ${tokenIndex})`

const readMessageFloatDatum = (
    _: Compilation,
    name: CodeVariableName,
    tokenIndex: number
) => `readFloatDatum(${name}, ${tokenIndex})`

const fillInLoopOutput = (
    compilation: Compilation,
    channel: number,
    value: CodeVariableName
) => {
    const globs = compilation.engineVariableNames.g
    return `${globs.output}[${globs.iterFrame} + ${globs.blockSize} * ${channel}] = ${value}`
}

const messageTransfer = (
    _: Compilation,
    template: Array<PdDspGraph.NodeArgument>,
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
                if (${inVariableName}.datumTypes[${inIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}) {
                    const stringDatum: string = readStringDatum(${inVariableName}, ${inIndex})
                    stringMem[${stringMemCount}] = stringDatum
                    outTemplate.push(stringDatum.length)
                }
            `)
            // prettier-ignore
            outMessageSetCode.push(`
                if (${inVariableName}.datumTypes[${inIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}) {
                    writeFloatDatum(outMessage, ${outIndex}, readFloatDatum(${inVariableName}, ${inIndex}))
                } else if (${inVariableName}.datumTypes[${inIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}) {
                    writeStringDatum(outMessage, ${outIndex}, stringMem[${stringMemCount}])
                }
            `)
            stringMemCount++
        } else if (operation.type === 'string-template') {
            // prettier-ignore
            outMessageTemplateCode.push(`
                let stringDatum: string = "${operation.template}"
                ${operation.variables.map(({placeholder, inIndex}) => `
                    if (${inVariableName}.datumTypes[${inIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]}) {
                        let value: string = readFloatDatum(${inVariableName}, ${inIndex}).toString()
                        if (value.endsWith('.0')) {
                            value = value.slice(0, -2)
                        }
                        stringDatum = stringDatum.replace(
                            "${placeholder}",
                            value
                        )
                    } else if (${inVariableName}.datumTypes[${inIndex}] === ${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]}) {
                        stringDatum = stringDatum.replace(
                            "${placeholder}",
                            readStringDatum(${inVariableName}, ${inIndex})
                        )
                    }`
                )}
                stringMem[${stringMemCount}] = stringDatum
                outTemplate.push(${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]})
                outTemplate.push(stringDatum.length)
            `)
            outMessageSetCode.push(`
                writeStringDatum(outMessage, ${outIndex}, stringMem[${stringMemCount}])
            `)
            stringMemCount++
        } else if (operation.type === 'string-constant') {
            // prettier-ignore
            outMessageTemplateCode.push(`
                outTemplate.push(${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_STRING]})
                outTemplate.push(${operation.value.length})
            `)

            outMessageSetCode.push(`
                writeStringDatum(outMessage, ${outIndex}, "${operation.value}")
            `)
        } else if (operation.type === 'float-constant') {
            outMessageTemplateCode.push(`
                outTemplate.push(${MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[MESSAGE_DATUM_TYPE_FLOAT]})
            `)

            outMessageSetCode.push(`
                writeFloatDatum(outMessage, ${outIndex}, ${operation.value})
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
    messageTransfer,
}

export default macros
