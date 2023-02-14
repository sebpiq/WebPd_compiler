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

import {
    AudioSettings,
    Code,
    Compilation,
    CompilerTarget,
    Engine,
} from './types'
import * as variableNames from './engine-common/code-variable-names'
import { getMacros } from './compile'
import { compileWasmModule } from './engine-assemblyscript/test-helpers'
import { createEngine as createAscEngine } from './engine-assemblyscript/AssemblyScriptWasmEngine'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile } from 'fs/promises'
import { graphTraversalForCompile } from './compile-helpers'
const execPromise = promisify(exec)

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 4) => {
    // Useful to round big numbers in scientific notation, e.g. 3.282417323806467e+38
    if (v > 1000000) {
        return +v.toPrecision(decimals)
    }
    const rounded =
        Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)
    // Useful to normalise -0 / 0 which compare as different.
    if (rounded === 0) {
        return 0
    }
    return rounded
}

export const makeCompilation = (
    compilation: Partial<Compilation>
): Compilation => {
    const debug = compilation.debug || false
    const target: CompilerTarget = compilation.target || 'javascript'
    const nodeImplementations = compilation.nodeImplementations || {
        DUMMY: { loop: () => '' },
    }
    const graph = compilation.graph || {}
    const inletCallerSpecs = compilation.inletCallerSpecs || {}
    const outletListenerSpecs = compilation.outletListenerSpecs || {}
    const graphTraversal =
        compilation.graphTraversal ||
        graphTraversalForCompile(graph, inletCallerSpecs)
    const precompiledPortlets = compilation.precompiledPortlets || {
        precompiledInlets: {},
        precompiledOutlets: {},
    }
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
    return {
        ...compilation,
        target,
        graph,
        graphTraversal,
        nodeImplementations,
        audioSettings,
        outletListenerSpecs,
        inletCallerSpecs,
        macros: getMacros(target),
        codeVariableNames,
        debug,
        precompiledPortlets,
    }
}

/** Helper function to create a WebPd `Engine` for running tests. */
export const createEngine = async (
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code
): Promise<Engine> => {
    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'asc'}`,
        code
    )
    if (target === 'javascript') {
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
        const wasmBuffer = await compileWasmModule(code, bitDepth)
        const engine = await createAscEngine(wasmBuffer)
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
