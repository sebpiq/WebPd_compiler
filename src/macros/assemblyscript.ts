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
import { AssemblyScriptCompilerSettingsWithDefaults } from "../types"

const declareInt = (_: Compilation, name: PdEngine.CodeVariableName, value: number | string) => 
    `let ${name}: i32 = i32(${value.toString()})`

const declareIntConst = (_: Compilation, name: PdEngine.CodeVariableName, value: number | string) => 
    `const ${name}: i32 = i32(${value.toString()})`

const declareSignal = (compilation: Compilation, name: PdEngine.CodeVariableName, value: number | string) => {
    const settings = compilation.settings as AssemblyScriptCompilerSettingsWithDefaults
    return `let ${name}: f${settings.bitDepth} = ${value.toString()}`
}

const declareMessageArray = (_: Compilation, name: PdEngine.CodeVariableName) => 
    `let ${name}: Message[] = []`

const fillInLoopOutput = (compilation: Compilation, channel: number, value: PdEngine.CodeVariableName) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${globs.iterFrame} + ${globs.blockSize} * ${channel}] = ${value}`
}

const MACROS = {
    declareInt,
    declareIntConst,
    declareSignal,
    declareMessageArray,
    fillInLoopOutput,
}

export default MACROS