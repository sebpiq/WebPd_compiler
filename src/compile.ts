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
    CompilerSettings,
    JavaScriptEngineCode,
    AssemblyScriptEngineCode,
    NodeImplementations,
} from './types'
import { Compilation } from './compilation'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptEngineCode => {
    const compilation = new Compilation(
        graph,
        nodeImplementations,
        compilerSettings
    )
    if (compilation.settings.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.settings.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    }
}