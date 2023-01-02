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
    EngineVariableNames,
    InletListenerSpecs,
    NodeImplementations,
    AccessorSpecs,
    CompilerTarget,
} from './types'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'
import * as variableNames from './engine-variable-names'
import { DspGraph } from '@webpd/dsp-graph'

export default (
    graph: DspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const { audioSettings, inletListenerSpecs, target } =
        validateSettings(compilerSettings)
    const macros = getMacros(target)
    const engineVariableNames = variableNames.generate(
        nodeImplementations,
        graph
    )
    const accessorSpecs = generateAccessorSpecs(
        engineVariableNames,
        inletListenerSpecs
    )
    variableNames.attachInletListeners(engineVariableNames, inletListenerSpecs)
    variableNames.attachAccessors(target, engineVariableNames, accessorSpecs)
    variableNames.attachTypes(
        engineVariableNames,
        audioSettings.bitDepth
    )
    return executeCompilation({
        target,
        graph,
        nodeImplementations,
        audioSettings,
        inletListenerSpecs,
        accessorSpecs,
        engineVariableNames,
        macros,
    })
}

/**
 * Helper to generate `accessorSpecs` from various settings.
 */
export const generateAccessorSpecs = (
    engineVariableNames: EngineVariableNames,
    inletListenerSpecs: InletListenerSpecs
): AccessorSpecs => {
    const accessorSpecs: AccessorSpecs = {}

    // An inlet listener needs to have read access to the variable representing the inlets it's listening to.
    Object.entries(inletListenerSpecs).map(([nodeId, inletIds]) => {
        inletIds.forEach((inletId) => {
            const inletVariableName = engineVariableNames.n[nodeId].ins[inletId]
            accessorSpecs[inletVariableName] = {
                access: 'r',
                type: 'message',
            }
        })
    })
    return accessorSpecs
}

/**
 * Asserts settings are valid (or throws error) and sets default values.
 */
export const validateSettings = (
    settings: CompilerSettings
): CompilerSettings => {
    const inletListenerSpecs = settings.inletListenerSpecs || {}
    if (![32, 64].includes(settings.audioSettings.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        ...settings,
        inletListenerSpecs,
    }
}

/**
 * Helper to get code macros from compile target.
 */
export const getMacros = (target: CompilerTarget): CodeMacros =>
    ({ javascript: jsMacros, assemblyscript: ascMacros }[target])

/**
 * Helper to execute compilation
 */
export const executeCompilation = (compilation: Compilation) => {
    if (compilation.target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (compilation.target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid compilation.target ${compilation.target}`)
    }
}

class InvalidSettingsError extends Error {}
