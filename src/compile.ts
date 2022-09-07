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

import JS_MACROS from './engine-javascript/macros'
import ASC_MACROS from './engine-assemblyscript/macros'
import { CodeMacros, Compilation, CompilerSettings, EngineVariableNames, InletListeners, NodeImplementations, NodeVariableNames, PortSpecs } from './types'
import compileToJavascript from './engine-javascript/compile-to-javascript'
import compileToAssemblyscript from './engine-assemblyscript/compile-to-assemblyscript'
import { JavaScriptEngineCode } from './engine-javascript/types'
import { AssemblyScriptWasmEngineCode } from './engine-assemblyscript/types'
import { createNamespace, getNodeImplementation } from './compile-helpers'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): JavaScriptEngineCode | AssemblyScriptWasmEngineCode => {
    const { audioSettings, inletListeners, target } = validateSettings(compilerSettings)
    const macros = getMacros(target)
    const engineVariableNames = generateEngineVariableNames(nodeImplementations, graph)
    const portSpecs = generatePortSpecs(engineVariableNames, inletListeners)
    attachPortsAndMessageListenersVariableNames(engineVariableNames, portSpecs, inletListeners)

    const compilation: Compilation = {
        graph,
        nodeImplementations,
        audioSettings,
        inletListeners,
        portSpecs,
        engineVariableNames,
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

/**
 * Generates the whole set of variable names for a compilation for a given graph.
 * 
 * @param nodeImplementations 
 * @param graph 
 * @returns 
 */
export const generateEngineVariableNames = (
    nodeImplementations: NodeImplementations, 
    graph: PdDspGraph.Graph
): EngineVariableNames =>
    ({
        n: createNamespace(
            Object.values(graph).reduce<EngineVariableNames['n']>(
                (nodeMap, node) => {
                    const nodeImplementation = getNodeImplementation(
                        nodeImplementations,
                        node.type
                    )
                    const nodeStateVariables =
                        nodeImplementation.stateVariables || []
                    nodeMap[node.id] = {
                        ins: createNamespace(
                            Object.values(node.inlets).reduce<
                                NodeVariableNames['ins']
                            >((nameMap, inlet) => {
                                nameMap[inlet.id] = `${assertValidNamePart(node.id)}_INS_${assertValidNamePart(inlet.id)}`
                                return nameMap
                            }, {})
                        ),
                        outs: createNamespace(
                            Object.values(node.outlets).reduce<
                                NodeVariableNames['outs']
                            >((nameMap, outlet) => {
                                nameMap[outlet.id] = `${assertValidNamePart(node.id)}_OUTS_${assertValidNamePart(outlet.id)}`
                                return nameMap
                            }, {})
                        ),
                        state: createNamespace(
                            nodeStateVariables.reduce<
                                NodeVariableNames['state']
                            >((nameMap, stateVariable) => {
                                nameMap[stateVariable] = `${assertValidNamePart(node.id)}_STATE_${assertValidNamePart(stateVariable)}`
                                return nameMap
                            }, {})
                        ),
                    }
                    return nodeMap
                },
                {}
            )
        ),
        g: {
            arrays: 'ARRAYS',
            iterOutlet: 'O',
            iterFrame: 'F',
            frame: 'FRAME',
            blockSize: 'BLOCK_SIZE',
            sampleRate: 'SAMPLE_RATE',
            output: 'OUTPUT',
        },
        ports: createNamespace({}),
        inletListeners: createNamespace({}),
    })

/**
 * Helper that attaches to the generated `engineVariableNames` the names of specified inlet listeners and port functions.
 * 
 * @param engineVariableNames 
 * @param portSpecs 
 * @param inletListeners 
 */
export const attachPortsAndMessageListenersVariableNames = (
    engineVariableNames: EngineVariableNames,
    portSpecs: PortSpecs,
    inletListeners: InletListeners,
): void => {
    Object.entries(portSpecs).forEach(([variableName, portSpec]) => {
        engineVariableNames.ports[variableName] = {}
        if (portSpec.access.includes('r')) {
            engineVariableNames.ports[variableName]['r'] = `read_${variableName}`
        }
        if (portSpec.access.includes('w')) {
            engineVariableNames.ports[variableName]['w'] = `write_${variableName}`
        }
    })
    Object.entries(inletListeners).forEach(([nodeId, inletIds]) => {
        engineVariableNames.inletListeners[nodeId] = {}
        inletIds.forEach(inletId => {
            engineVariableNames.inletListeners[nodeId][inletId] = `inletListener_${nodeId}_${inletId}`
        })
    })
}

export const assertValidNamePart = (namePart: string) => {
    const isInvalid = !VALID_NAME_PART_REGEXP.exec(namePart)
    if (isInvalid) {
        throw new Error(
            `Invalid variable name for code generation "${namePart}"`
        )
    }
    return namePart
}

const VALID_NAME_PART_REGEXP = /^[a-zA-Z0-9_]+$/

/**
 * Helper to generate `portSpecs` from various settings.
 * 
 * @param inletListeners 
 * @returns 
 */
export const generatePortSpecs = (
    engineVariableNames: EngineVariableNames,
    inletListeners: InletListeners): PortSpecs => {
    const portSpecs: PortSpecs = {}

    // An inlet listener needs to have read access to the variable representing the inlets it's listening to.
    Object.entries(inletListeners).map(([nodeId, inletIds]) => {
        inletIds.forEach(inletId => {
            const inletVariableName = engineVariableNames.n[nodeId].ins[inletId]
            portSpecs[inletVariableName] = {
                access: 'r',
                type: 'messages',
            }
        })
    })
    return portSpecs
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
export const getMacros = (target: CompilerSettings["target"]): CodeMacros => 
    ({'javascript': JS_MACROS, 'assemblyscript': ASC_MACROS}[target])

class InvalidSettingsError extends Error {}
