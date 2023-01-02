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

import { DspGraph } from "@webpd/dsp-graph"

export const buildMessageTransferOperations = (
    template: Array<DspGraph.NodeArgument>
): Array<MessageTransferOperation> => {
    // Creates an array of transfer functions `inVal -> outVal`.
    return template.map((templateElem) => {
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
                const variables: MessageTransferOperationStringTemplate['variables'] =
                    []
                let matched: RegExpMatchArray | null
                while ((matched = DOLLAR_VAR_RE_GLOB.exec(templateElem))) {
                    // position -1, because $1 corresponds to value 0.
                    variables.push({
                        placeholder: matched[0],
                        inIndex: parseInt(matched[1]!, 10) - 1,
                    })
                }
                return {
                    type: 'string-template',
                    template: templateElem,
                    variables,
                }

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
    variables: Array<{ placeholder: string; inIndex: number }>
}

type MessageTransferOperation =
    | MessageTransferOperationNoop
    | MessageTransferOperationFloatConstant
    | MessageTransferOperationStringConstant
    | MessageTransferOperationStringTemplate
