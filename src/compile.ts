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

import { CompilerSettings, NodeImplementations } from './types'
import { Compilation, generateEngineVariableNames, validateSettings } from './compilation'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'
import ASC_MACROS from './engine-assemblyscript/macros'
import JS_MACROS from './engine-javascript/macros'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const validatedSettings = validateSettings(compilerSettings)
    const macros = {
        'assemblyscript': ASC_MACROS,
        'javascript': JS_MACROS,
    }[compilerSettings.target]
    const compilation: Compilation = {
        graph,
        nodeImplementations,
        settings: validatedSettings,
        variableNames: generateEngineVariableNames(nodeImplementations, graph),
        macros
    }

    if (compilation.settings.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.settings.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    }
}
