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

import { Compilation } from "../compilation"

const declareInt = (_: Compilation, name: PdEngine.CodeVariableName, value: number | string) => 
    `let ${name} = ${value.toString()}`

const declareIntConst = (_: Compilation, name: PdEngine.CodeVariableName, value: number | string) => 
    `const ${name} = ${value.toString()}`

const declareSignal = (_: Compilation, name: PdEngine.CodeVariableName, value: number | string) => 
    `let ${name} = ${value.toString()}`

const declareMessageArray = (_: Compilation, name: PdEngine.CodeVariableName) => 
    `let ${name} = []`

const fillInLoopOutput = (compilation: Compilation, channel: number, value: PdEngine.CodeVariableName) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${channel}][${globs.iterFrame}] = ${value}`
}

const MACROS = {
    declareInt,
    declareIntConst,
    declareSignal,
    declareMessageArray,
    fillInLoopOutput
}

export default MACROS