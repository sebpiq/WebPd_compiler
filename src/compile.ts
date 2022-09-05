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
    const { audioSettings, messageListenerSpecs } = validateSettings(compilerSettings)
    const macros = {
        'assemblyscript': ASC_MACROS,
        'javascript': JS_MACROS,
    }[compilerSettings.target]

    // TODO : move to compilation object ? Beware compilation object ravioli code. 
    // Maybe more functional approach, passing down things like macros, etc ... 
    // better layer things

    // Merge `messageListenerSpecs` into `portSpecs` because message listeners need to have read access
    // to the inlets they're listening to.
    // !!! We're careful to deep-copy `portSpecs` so that the caller doesn't have strange bugs
    // if we modify the passed `portSpecs` by mistake.
    const portSpecs: PortSpecs = {}
    Object.keys(messageListenerSpecs).map(variableName => {
        if (portSpecs[variableName]) {
            const spec = {...portSpecs[variableName]}
            if (spec.type !== 'messages') {
                throw new Error(`Incompatible portSpecs and messageListenerSpecs for variable ${variableName}`)
            }
            if (!spec.access.includes('r')) {
                spec.access += 'r'
            }
            portSpecs[variableName] = spec
        } else {
            portSpecs[variableName] = {
                access: 'r',
                type: 'messages',
            }
        }
    })

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
