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

import {
    Compilation,
    CompilationSettings,
    NodeImplementations,
} from './types'
import compileToJavascript from '../engine-javascript/compile'
import compileToAssemblyscript from '../engine-assemblyscript/compile'
import { JavaScriptEngineCode } from '../engine-javascript/compile/types'
import { AssemblyScriptWasmEngineCode } from '../engine-assemblyscript/compile/types'
import { generateCodeVariableNames } from './code-variable-names'
import {
    buildGraphTraversalDeclare,
    buildGraphTraversalLoop,
} from './compile-helpers'
import { DspGraph } from '../dsp-graph/types'
import { traversal } from '../dsp-graph'
import precompile, { initializePrecompilation } from './precompile'

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
    const precompilation = initializePrecompilation(graph)
    const variableNamesIndex = generateCodeVariableNames(
        nodeImplementations,
        graph,
        debug
    )
    const graphTraversalDeclare = buildGraphTraversalDeclare(
        graph,
        inletCallerSpecs
    )
    const graphTraversalLoop = buildGraphTraversalLoop(graph)
    const trimmedGraph = traversal.trimGraph(graph, graphTraversalDeclare)

    return {
        status: 0,
        code: executeCompilation({
            target,
            graph: trimmedGraph,
            graphTraversalDeclare,
            graphTraversalLoop,
            nodeImplementations,
            audioSettings,
            arrays,
            inletCallerSpecs,
            outletListenerSpecs,
            variableNamesIndex,
            debug,
            precompilation,
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

/** Helper to execute compilation */
export const executeCompilation = (compilation: Compilation) => {
    precompile(compilation)
    if (compilation.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid compilation.target ${compilation.target}`)
    }
}

class InvalidSettingsError extends Error {}
