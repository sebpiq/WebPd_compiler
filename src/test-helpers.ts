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

import { Code, Compilation, CompilerTarget, Engine, FloatArray } from './types'
import * as variableNames from './engine-common/code-variable-names'
import { getMacros } from './compile'
import { JavaScriptEngine } from './engine-javascript/types'
import { compileWasmModule } from './engine-assemblyscript/test-helpers'
import { createEngine as createAscEngine } from './engine-assemblyscript/AssemblyScriptWasmEngine'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { lowerString, readTypedArray } from './engine-assemblyscript/core-code/core-bindings'
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
    const codeVariableNames = variableNames.generate(
        nodeImplementations,
        graph,
        debug
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
    }
    variableNames.attachOutletListeners(codeVariableNames, outletListenerSpecs)
    variableNames.attachInletCallers(codeVariableNames, inletCallerSpecs)
    variableNames.attachTypes(codeVariableNames, audioSettings.bitDepth)
    return {
        ...compilation,
        target,
        graph,
        nodeImplementations,
        audioSettings,
        outletListenerSpecs,
        inletCallerSpecs,
        macros: getMacros(target),
        codeVariableNames,
        debug,
    }
}

/**
 * Helper function to create a WebPd `Engine` for running tests.
 * It has for example an added `getArray` function to read arrays.
 */
export const createEngine = async (
    target: CompilerTarget,
    code: Code
): Promise<Engine & {getArray: (arrayName: string) => Float32Array}> => {
    if (target === 'javascript') {
        code += `
            exports.getArray = (arrayName) => 
                ARRAYS.get(arrayName)
        `
        try {
            return new Function(`
                ${code}
                return exports
            `)() as any
        } catch (err) {
            const errMessage = await getJSEvalErrorSite(code)
            throw new Error('ERROR in generated JS code ' + errMessage)
        }
    } else {
        code += `
            export function getArray(arrayName: string): FloatArray {
                return ARRAYS.get(arrayName)
            } 
        `
        const wasmBuffer = await compileWasmModule(code)
        const engine = await createAscEngine(wasmBuffer)
        ;(engine as any).getArray = (arrayName: string) => {
            const stringPointer = lowerString(engine.wasmExports, arrayName)
            const arrayPointer = (engine.wasmExports as any).getArray(stringPointer)
            return readTypedArray(
                engine.wasmExports, 
                engine.metadata.audioSettings.bitDepth === 32 ? Float32Array: Float64Array, arrayPointer)
        }
        return engine as any
    }
}

const getJSEvalErrorSite = async (code: string) => {
    const filepath = '/tmp/file.mjs'
    writeFileSync(filepath, code)
    try {
        await execPromise('node --experimental-vm-modules ' + filepath)
    } catch (error) {
        const matched = new RegExp(`${filepath}:([0-9]+)`).exec(error.stack)
        if (matched) {
            const lineNumber = parseInt(matched[1], 10)
            const lineBefore = Math.max(lineNumber - 3, 0)
            const lineAfter = lineNumber + 3
            const codeLines = code
                .split('\n')
                .map((line, i) =>
                    i + 1 === lineNumber ? '-> ' + line + ' <-' : '  ' + line
                )
            return (
                `line ${lineNumber} : \n` +
                codeLines.slice(lineBefore, lineAfter).join('\n') +
                '\n-----\n' +
                error.toString()
            )
        } else {
            console.warn(`couldn't parse error line`)
            return (
                `copy/pasting node command stacktrace : \n` + error.toString()
            )
        }
    }
    console.warn(`no error found :thinking:`)
    return ''
}
