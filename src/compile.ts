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
} from './types'
import compileToJavascript, {
    attachAccessorsVariableNames as jsAttachAccessorsVariableNames,
} from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript, {
    attachAccessorsVariableNames as ascAttachAccessorsVariableNames,
} from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'
import {
    attachInletListenersVariableNames,
    generateEngineVariableNames,
} from './engine-variable-names'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const { audioSettings, inletListeners, target } = validateSettings(
        compilerSettings
    )
    const macros = getMacros(target)
    const engineVariableNames = generateEngineVariableNames(
        nodeImplementations,
        graph
    )
    const accessorSpecs = generateAccessorSpecs(
        engineVariableNames,
        inletListeners
    )
    attachInletListenersVariableNames(engineVariableNames, inletListeners)

    if (target === 'javascript') {
        jsAttachAccessorsVariableNames(engineVariableNames, accessorSpecs)
    } else if (target === 'assemblyscript') {
        ascAttachAccessorsVariableNames(engineVariableNames, accessorSpecs)
    }

    const compilation: Compilation = {
        target,
        graph,
        nodeImplementations,
        audioSettings,
        inletListenerSpecs: inletListeners,
        accessorSpecs,
        engineVariableNames,
        macros,
    }

    if (target === 'javascript') {
        return compileToJavascript(compilation)
    } else if (target === 'assemblyscript') {
        return compileToAssemblyscript(compilation)
    } else {
        throw new Error(`Invalid target ${target}`)
    }
}

/**
 * Helper to generate `accessorSpecs` from various settings.
 *
 * @param inletListeners
 * @returns
 */
export const generateAccessorSpecs = (
    engineVariableNames: EngineVariableNames,
    inletListeners: InletListenerSpecs
): AccessorSpecs => {
    const accessorSpecs: AccessorSpecs = {}

    // An inlet listener needs to have read access to the variable representing the inlets it's listening to.
    Object.entries(inletListeners).map(([nodeId, inletIds]) => {
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
 *
 * @param settings
 * @returns
 */
export const validateSettings = (
    settings: CompilerSettings
): CompilerSettings => {
    const inletListeners = settings.inletListeners || {}
    if (![32, 64].includes(settings.audioSettings.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        ...settings,
        inletListeners,
    }
}

/**
 * Helper to get code macros from compile target.
 * @param target
 * @returns
 */
export const getMacros = (target: CompilerSettings['target']): CodeMacros =>
    ({ javascript: jsMacros, assemblyscript: ascMacros }[target])

class InvalidSettingsError extends Error {}
