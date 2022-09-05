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

import { CompilerSettings, NodeImplementations, PortSpecs } from './types'
import { Compilation, generateEngineVariableNames, generatePortSpecs, getMacros, validateSettings } from './compilation'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const { audioSettings, messageListenerSpecs, target } = validateSettings(compilerSettings)
    const macros = getMacros(target)
    const portSpecs: PortSpecs = generatePortSpecs(messageListenerSpecs)

    const compilation: Compilation = {
        graph,
        nodeImplementations,
        audioSettings,
        messageListenerSpecs,
        portSpecs,
        variableNames: generateEngineVariableNames(nodeImplementations, graph),
        macros,
    }

    if (compilerSettings.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilerSettings.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid target ${compilerSettings.target}`)
    }
}
