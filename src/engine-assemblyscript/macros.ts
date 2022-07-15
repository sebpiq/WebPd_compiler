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
import { AssemblyScriptCompilerSettingsWithDefaults, CodeVariableName } from "../types"

const declareInt = (_: Compilation, name: CodeVariableName, value: number | string) => 
    `let ${name}: i32 = i32(${value.toString()})`

const declareIntConst = (_: Compilation, name: CodeVariableName, value: number | string) => 
    `const ${name}: i32 = i32(${value.toString()})`

const declareFloat = (compilation: Compilation, name: CodeVariableName, value: number | string) => {
    const settings = compilation.settings as AssemblyScriptCompilerSettingsWithDefaults
    return `let ${name}: f${settings.bitDepth} = ${value.toString()}`
}

const declareFloatArray = (compilation: Compilation, name: CodeVariableName, size: number) => {
    const settings = compilation.settings as AssemblyScriptCompilerSettingsWithDefaults
    const FloatArrayType = settings.bitDepth === 32 ? 'Float32Array': 'Float64Array'
    return `let ${name}: ${FloatArrayType} = new ${FloatArrayType}(${size})`
}

const declareMessageArray = (_: Compilation, name: CodeVariableName) => 
    `let ${name}: Message[] = []`

const fillInLoopOutput = (compilation: Compilation, channel: number, value: CodeVariableName) => {
    const globs = compilation.variableNames.g
    return `${globs.output}[${globs.iterFrame} + ${globs.blockSize} * ${channel}] = ${value}`
}

const MACROS = {
    declareInt,
    declareIntConst,
    declareFloat,
    declareFloatArray,
    declareMessageArray,
    fillInLoopOutput,
}

export default MACROS