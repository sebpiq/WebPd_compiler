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
import { CodeMacros, Compilation, CompilerSettings, EngineVariableNames, MessageListeners, MessageListenerSpecs, NodeImplementation, NodeImplementations, NodeVariableNames, PortSpecs, WrappedCodeMacros } from './types'
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
    const { audioSettings, messageListeners, target } = validateSettings(compilerSettings)
    const macros = getMacros(target)
    const engineVariableNames = generateEngineVariableNames(nodeImplementations, graph)
    const messageListenerSpecs = generateMessageListenerSpecs(engineVariableNames, messageListeners)
    const portSpecs = generatePortSpecs(messageListenerSpecs)
    attachPortsAndMessageListenersVariableNames(engineVariableNames, portSpecs, messageListenerSpecs)

    const compilation: Compilation = {
        graph,
        nodeImplementations,
        audioSettings,
        messageListenerSpecs,
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
        messageListeners: createNamespace({}),
    })

/**
 * Helper that attaches to the generated `engineVariableNames` the names of specified message listeners and port functions.
 * 
 * @param engineVariableNames 
 * @param portSpecs 
 * @param messageListenerSpecs 
 */
export const attachPortsAndMessageListenersVariableNames = (
    engineVariableNames: EngineVariableNames,
    portSpecs: PortSpecs,
    messageListenerSpecs: MessageListenerSpecs,
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
    Object.keys(messageListenerSpecs).forEach(variableName => {
        engineVariableNames.messageListeners[variableName] = `messageListener_${variableName}`
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
 * Helper to generate `messageListenerSpecs` from messageListeners and inlet variable names.
 * 
 * @param engineVariableNames 
 * @param messageListeners 
 * @returns 
 */
export const generateMessageListenerSpecs = (
    engineVariableNames: EngineVariableNames,
    messageListeners: MessageListeners,
) => {
    const messageListenerSpecs: MessageListenerSpecs = {}
    Object.entries(messageListeners).forEach(([nodeId, listeners]) => {
        Object.entries(listeners).forEach(([inletId, callback]) => {
            const inletVariableName = engineVariableNames.n[nodeId].ins[inletId]
            messageListenerSpecs[inletVariableName] = callback
        })
    })
    return messageListenerSpecs
}

/**
 * Helper to generate `portSpecs` from various settings.
 * 
 * @param messageListenerSpecs 
 * @returns 
 */
export const generatePortSpecs = (messageListenerSpecs: MessageListenerSpecs): PortSpecs => {
    const portSpecs: PortSpecs = {}

    // Message listeners need to have read access to the inlets they're listening to.
    Object.keys(messageListenerSpecs).map(variableName => {
        portSpecs[variableName] = {
            access: 'r',
            type: 'messages',
        }
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
    const messageListeners = settings.messageListeners || {}
    if (![32, 64].includes(settings.audioSettings.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        ...settings,
        messageListeners,
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
