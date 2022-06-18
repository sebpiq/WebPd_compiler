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

import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = () => ``

// ------------------------------- loop ------------------------------ //
// Takes a message array as input, and constructs the output message using `template` argument.
// For example :
//
//     [56, '$1', 'bla', '$2-$1']
//     transfer([89, 'bli']); // [56, 89, 'bla', 'bli-89']
//
export const loop: NodeCodeGenerator = (node, { ins, outs }) => {
    let outElements: Array<PdEngine.Code> = []
    const template = node.args.template as Array<PdDspGraph.NodeArgument>

    // Creates an array of transfer functions `inVal -> outVal`.
    template.forEach((templateElem) => {
        if (typeof templateElem === 'string') {
            const matchDollar = DOLLAR_VAR_RE.exec(templateElem)

            // If the transfer is a dollar var :
            //      ['bla', 789] - ['$1'] -> ['bla']
            //      ['bla', 789] - ['$2'] -> [789]
            if (matchDollar && matchDollar[0] === templateElem) {
                // -1, because $1 corresponds to value 0.
                const inIndex = parseInt(matchDollar[1], 10) - 1
                outElements.push(`inMessage[${inIndex}]`)

                // If the transfer is a string containing dollar var :
                //      ['bla', 789] - ['bla$2'] -> ['bla789']
            } else if (matchDollar) {
                const dollarVars: Array<[string, number]> = []
                let matched: RegExpMatchArray
                while ((matched = DOLLAR_VAR_RE_GLOB.exec(templateElem))) {
                    // position -1, because $1 corresponds to value 0.
                    dollarVars.push([matched[0], parseInt(matched[1], 10) - 1])
                }

                outElements.push(
                    `"${templateElem}"${dollarVars.map(
                        ([placeholder, inIndex]) =>
                            `.replace("${placeholder}", inMessage[${inIndex}])`
                    )}`
                )

                // Else the input doesn't matter
            } else {
                outElements.push(`"${templateElem}"`)
            }
        } else {
            outElements.push(`${templateElem}`)
        }
    })

    return `
        while (${ins('0')}.length) {
            const inMessage = ${ins('0')}.shift()
            ${outs('0')}.push([${outElements.join(', ')}])
        }
    `
}

// ------------------------------------------------------------------- //
const DOLLAR_VAR_RE = /\$(\d+)/
const DOLLAR_VAR_RE_GLOB = /\$(\d+)/g
