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
    CompilerTarget,
    NodeImplementations,
} from './types'
import compileToJavascript from '../engine-javascript/compile'
import compileToAssemblyscript from '../engine-assemblyscript/compile'
import { JavaScriptEngineCode } from '../engine-javascript/compile/types'
import { AssemblyScriptWasmEngineCode } from '../engine-assemblyscript/compile/types'
import { generateVariableNamesIndex } from './variable-names-index'
import { buildFullGraphTraversal } from './compile-helpers'
import { DspGraph } from '../dsp-graph/types'
import { traversers } from '../dsp-graph'
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
    target: CompilerTarget,
    compilationSettings: CompilationSettings
): CompilationResult => {
    const settings = validateSettings(compilationSettings)
    const variableNamesIndex = generateVariableNamesIndex(graph, settings.debug)
    const fullGraphTraversal = buildFullGraphTraversal(
        graph,
        settings.io
    )
    const trimmedGraph = traversers.trimGraph(graph, fullGraphTraversal)

    const compilation: Compilation = {
        graph: trimmedGraph,
        nodeImplementations,
        target,
        settings,
        variableNamesIndex,
        precompilation: initializePrecompilation(
            trimmedGraph,
            fullGraphTraversal,
            variableNamesIndex,
            nodeImplementations,
        ),
    }

    precompile(compilation)
    let code: JavaScriptEngineCode | AssemblyScriptWasmEngineCode
    if (compilation.target === 'javascript') {
        code = compileToJavascript(compilation)
    } else if (compilation.target === 'assemblyscript') {
        code = compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid compilation.target ${compilation.target}`)
    }

    return {
        status: 0,
        code,
    }
}

/** Asserts user provided settings are valid (or throws error) and sets default values. */
export const validateSettings = (
    compilationSettings: CompilationSettings
): Compilation['settings'] => {
    const arrays = compilationSettings.arrays || {}
    const io = {
        messageReceivers: (compilationSettings.io || {}).messageReceivers || {},
        messageSenders: (compilationSettings.io || {}).messageSenders || {},
    }
    const debug = compilationSettings.debug || false
    const audio = compilationSettings.audio || {
        channelCount: { in: 2, out: 2 },
        bitDepth: 64,
    }
    if (![32, 64].includes(audio.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }

    return {
        audio,
        arrays,
        io,
        debug,
    }
}

class InvalidSettingsError extends Error {}
