/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd 
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import jsMacros from './engine-javascript/macros'
import ascMacros from './engine-assemblyscript/macros'
import {
    CodeMacros,
    Compilation,
    CompilationSettings,
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

interface CompilationSuccess {
    status: 0
    code: JavaScriptEngineCode | AssemblyScriptWasmEngineCode
}

interface CompilationFailure {
    status: 1
}

type CompilationResult = CompilationSuccess | CompilationFailure

export default (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations,
    settings: CompilationSettings
): CompilationResult => {
    const {
        audioSettings,
        arrays,
        inletCallerSpecs,
        outletListenerSpecs,
        target,
        debug,
    } = validateSettings(settings)
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

    return {
        status: 0,
        code: executeCompilation({
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
        }),
    }
}

/** Asserts settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    settings: CompilationSettings
): CompilationSettings => {
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
