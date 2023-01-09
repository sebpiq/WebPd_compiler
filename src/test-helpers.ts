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

import { Code, Compilation, CompilerTarget } from './types'
import * as variableNames from './engine-common/engine-variable-names'
import { getMacros } from './compile'
import { JavaScriptEngine } from './engine-javascript/types'
import { compileWasmModule } from './engine-assemblyscript/test-helpers'
import { createEngine as createAscEngine } from './engine-assemblyscript/AssemblyScriptWasmEngine'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'
import {promisify} from 'util'
const execPromise = promisify(exec)

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 3) =>
    Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)

export const makeCompilation = (
    compilation: Partial<Compilation>
): Compilation => {
    if (!compilation.target) {
        throw new Error(`Compilation target must be provided`)
    }
    const debug = compilation.debug || false
    const target: CompilerTarget = compilation.target
    const nodeImplementations = compilation.nodeImplementations || {
        DUMMY: { loop: () => '' },
    }
    const graph = compilation.graph || {}
    const outletListenerSpecs = compilation.outletListenerSpecs || {}
    const inletCallerSpecs = compilation.inletCallerSpecs || {}
    const engineVariableNames = variableNames.generate(
        nodeImplementations,
        graph,
        debug
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
    }
    variableNames.attachOutletListeners(engineVariableNames, outletListenerSpecs)
    variableNames.attachInletCallers(engineVariableNames, inletCallerSpecs)
    variableNames.attachTypes(engineVariableNames, audioSettings.bitDepth)
    return {
        ...compilation,
        target,
        graph,
        nodeImplementations,
        audioSettings,
        outletListenerSpecs,
        inletCallerSpecs,
        macros: getMacros(target),
        engineVariableNames,
        debug
    }
}

export const createEngine = async (target: CompilerTarget, code: Code) => {
    if (target === 'javascript') {
        try {
            return new Function(`
                ${code}
                return exports
            `)() as JavaScriptEngine
        } catch (err) {
            const errMessage = await getJSEvalErrorSite(code)
            throw new Error('ERROR in generated JS code ' + errMessage)
        }
    } else {
        const wasmBuffer = await compileWasmModule(code)
        return await createAscEngine(wasmBuffer)
    }
}

const getJSEvalErrorSite = async (code: string) => {
    const filepath = '/tmp/file.mjs'
    writeFileSync(filepath, code)
    try {
        await execPromise('node --experimental-vm-modules ' + filepath)
    } catch(error) {
        const matched = (new RegExp(`${filepath}:([0-9]+)`)).exec(error.stack)
        if (matched) {
            const lineNumber = parseInt(matched[1], 10)
            const lineBefore = Math.max(lineNumber - 3, 0)
            const lineAfter = lineNumber + 3
            const codeLines = code.split('\n').map((line, i) => (i + 1) === lineNumber ? '-> ' + line + ' <-': '  ' + line)
            return `line ${lineNumber} : \n` + codeLines.slice(lineBefore, lineAfter).join('\n')
        } else {
            console.warn(`couldn't parse error line`)
            return `copy/pasting node command stacktrace : \n` + error.toString()
        }
    }
    console.warn(`no error found :thinking:`)
    return ''
}