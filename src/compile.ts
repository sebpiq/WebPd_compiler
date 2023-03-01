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

import jsMacros from './engine-javascript/macros'
import ascMacros from './engine-assemblyscript/macros'
import {
    CodeMacros,
    Compilation,
    CompilerSettings,
    NodeImplementations,
    CompilerTarget,
} from './types'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'
import * as variableNames from './engine-common/code-variable-names'
import {
    graphTraversalForCompile,
    preCompileSignalAndMessageFlow,
} from './compile-helpers'
import { DspGraph } from './dsp-graph/types'
import { traversal } from './dsp-graph'

export default (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const {
        audioSettings,
        arrays,
        inletCallerSpecs,
        outletListenerSpecs,
        target,
        debug,
    } = validateSettings(compilerSettings)
    const macros = getMacros(target)
    const codeVariableNames = variableNames.generate(
        nodeImplementations,
        graph,
        debug
    )
    variableNames.attachInletCallers(codeVariableNames, inletCallerSpecs)
    variableNames.attachOutletListeners(codeVariableNames, outletListenerSpecs)

    const graphTraversal = graphTraversalForCompile(graph, inletCallerSpecs)
    traversal.trimGraph(graph, graphTraversal)

    return executeCompilation({
        target,
        graph,
        graphTraversal,
        nodeImplementations,
        audioSettings,
        arrays,
        inletCallerSpecs,
        outletListenerSpecs,
        codeVariableNames,
        macros,
        debug,
        precompiledPortlets: {
            precompiledInlets: {},
            precompiledOutlets: {},
        },
    })
}

/** Asserts settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    settings: CompilerSettings
): CompilerSettings => {
    const arrays = settings.arrays || {}
    const inletCallerSpecs = settings.inletCallerSpecs || {}
    const outletListenerSpecs = settings.outletListenerSpecs || {}
    const debug = settings.debug || false
    if (![32, 64].includes(settings.audioSettings.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        ...settings,
        arrays,
        outletListenerSpecs,
        inletCallerSpecs,
        debug,
    }
}

/** Helper to get code macros from compile target. */
export const getMacros = (target: CompilerTarget): CodeMacros =>
    ({ javascript: jsMacros, assemblyscript: ascMacros }[target])

/** Helper to execute compilation */
export const executeCompilation = (compilation: Compilation) => {
    preCompileSignalAndMessageFlow(compilation)
    if (compilation.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid compilation.target ${compilation.target}`)
    }
}

class InvalidSettingsError extends Error {}
