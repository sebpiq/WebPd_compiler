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

import { Code, CodeMacros, Compilation, NodeImplementation, NodeImplementations, WrappedCodeMacros } from './types'

type CodeLines = Array<CodeLines | Code>

/**
 * Helper to render code.
 * Allows to pass templated strings with arrays and arrays of arrays of codelines, adding new lines automatically.
 * @param strings
 * @param codeLines
 * @returns
 */
export const renderCode = (
    strings: TemplateStringsArray,
    ...codeLines: CodeLines
): Code => {
    let rendered: string = ''
    for (let i = 0; i < strings.length; i++) {
        rendered += strings[i]
        if (codeLines[i]) {
            rendered += renderCodeLines(codeLines[i])
        }
    }
    return rendered
}

const renderCodeLines = (codeLines: CodeLines | Code): Code => {
    if (Array.isArray(codeLines)) {
        return codeLines.map(renderCodeLines).join('\n')
    }
    return codeLines
}

/**
 * Helper to generate VariableNames, essentially a proxy object that throws an error
 * when trying to access undefined properties.
 * 
 * @param namespace 
 * @returns 
 */
export const createNamespace = <T extends Object>(namespace: T) => {
    return new Proxy<T>(namespace, {
        get: (target, k) => {
            const key = String(k)
            if (!target.hasOwnProperty(key)) {
                if (key[0] === '$' && target.hasOwnProperty(key.slice(1))) {
                    return (target as any)[key.slice(1)]
                }

                // Whitelist some fields that are undefined but accessed at
                // some point or another by our code.
                if (['toJSON', 'Symbol(Symbol.toStringTag)', 'constructor', '$$typeof', 
                    '@@__IMMUTABLE_ITERABLE__@@', '@@__IMMUTABLE_RECORD__@@'].includes(key)) {
                    return undefined
                }
                throw new Error(`Namespace doesn't know key "${String(key)}"`)
            }
            return (target as any)[key]
        },
    })
}

export const wrapMacros = (
    codeMacros: CodeMacros, 
    compilation: Compilation
): WrappedCodeMacros => {
    const wrappedCodeMacros = {} as Partial<WrappedCodeMacros>
    Object.entries(codeMacros).forEach(([key, macro]) => {
        wrappedCodeMacros[key as keyof CodeMacros] = macro.bind(
            undefined,
            compilation
        )
    })
    return wrappedCodeMacros as WrappedCodeMacros
}

/**
 * Helper to get node implementation or throw an error if not implemented.
 * 
 * @param nodeImplementations 
 * @param nodeType 
 * @returns 
 */
export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: PdSharedTypes.NodeType
): NodeImplementation => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node ${nodeType} is not implemented`)
    }
    return nodeImplementation
}

export const buildMessageTransferOperations = (
    template: Array<PdDspGraph.NodeArgument>,
): Array<MessageTransferOperation> => {    
    // Creates an array of transfer functions `inVal -> outVal`.
    return template.map(templateElem => {
        if (typeof templateElem === 'string') {
            const matchDollar = DOLLAR_VAR_RE.exec(templateElem)
    
            // If the transfer is a dollar var :
            //      ['bla', 789] - ['$1'] -> ['bla']
            //      ['bla', 789] - ['$2'] -> [789]
            if (matchDollar && matchDollar[0] === templateElem) {
                // -1, because $1 corresponds to value 0.
                const inIndex = parseInt(matchDollar[1], 10) - 1
                return { type: 'noop', inIndex }

            } else if (matchDollar) {
                const variables: MessageTransferOperationStringTemplate["variables"] = []
                let matched: RegExpMatchArray | null
                while ((matched = DOLLAR_VAR_RE_GLOB.exec(templateElem))) {
                    // position -1, because $1 corresponds to value 0.
                    variables.push({
                        placeholder: matched[0], 
                        inIndex: parseInt(matched[1]!, 10) - 1,
                    })
                }
                return { type: 'string-template', template: templateElem, variables }
    
                // Else the input doesn't matter
            } else {
                return { type: 'string-constant', value: templateElem }
            }
        } else {
            return { type: 'float-constant', value: templateElem }
        }
    })
}

const DOLLAR_VAR_RE = /\$(\d+)/
const DOLLAR_VAR_RE_GLOB = /\$(\d+)/g

interface MessageTransferOperationNoop {
    type: 'noop'
    inIndex: number
}

interface MessageTransferOperationFloatConstant {
    type: 'float-constant'
    value: number
}

interface MessageTransferOperationStringConstant {
    type: 'string-constant'
    value: string
}

interface MessageTransferOperationStringTemplate {
    type: 'string-template'
    template: string
    variables: Array<{ placeholder: string, inIndex: number }>
}

type MessageTransferOperation = MessageTransferOperationNoop | MessageTransferOperationFloatConstant | MessageTransferOperationStringConstant | MessageTransferOperationStringTemplate