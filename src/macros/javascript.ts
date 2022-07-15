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
import { CodeVariableName } from "../types"

const declareInt = (_: Compilation, name: CodeVariableName, value: number | string) => 
    `let ${name} = ${value.toString()}`

const declareIntConst = (_: Compilation, name: CodeVariableName, value: number | string) => 
    `const ${name} = ${value.toString()}`

const declareFloat = (_: Compilation, name: CodeVariableName, value: number | string) => 
    `let ${name} = ${value.toString()}`

const declareFloatArray = (_: Compilation, name: CodeVariableName, size: number) => {
    return `let ${name} = new Float32Array(${size})`
}

const declareMessageArray = (_: Compilation, name: CodeVariableName) => 
    `let ${name} = []`

const fillInLoopOutput = (compilation: Compilation, channel: number, value: CodeVariableName) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${channel}][${globs.iterFrame}] = ${value}`
}

const MACROS = {
    declareInt,
    declareIntConst,
    declareFloat,
    declareFloatArray,
    declareMessageArray,
    fillInLoopOutput
}

export default MACROS