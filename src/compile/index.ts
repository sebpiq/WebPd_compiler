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
    UserCompilationSettings,
    CompilerTarget,
    NodeImplementations,
} from './types'
import renderToJavascript from '../engine-javascript/compile/render'
import renderToAssemblyscript from '../engine-assemblyscript/compile/render'
import { JavaScriptEngineCode } from '../engine-javascript/compile/types'
import { AssemblyScriptWasmEngineCode } from '../engine-assemblyscript/compile/types'
import { DspGraph } from '../dsp-graph/types'
import precompile from './precompile'
import { validateSettings } from './settings'

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
    compilationSettings: UserCompilationSettings
): CompilationResult => {
    const settings = validateSettings(compilationSettings, target)
    const { precompiledCode, variableNamesIndex } = precompile(
        {
            graph,
            nodeImplementations,
            settings,
        }
    )

    let code: JavaScriptEngineCode | AssemblyScriptWasmEngineCode
    if (target === 'javascript') {
        code = renderToJavascript({
            precompiledCode,
            settings,
            variableNamesIndex,
        })
    } else if (target === 'assemblyscript') {
        code = renderToAssemblyscript({
            precompiledCode,
            settings,
            variableNamesIndex,
        })
    } else {
        throw new Error(`Invalid target ${target}`)
    }

    return {
        status: 0,
        code,
    }
}
