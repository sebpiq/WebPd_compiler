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
import { CodeMacros, Compilation, CompilerSettings, EngineVariableNames, MessageListenerSpecs, NodeImplementation, NodeImplementations, NodeVariableNames, PortSpecs, WrappedCodeMacros } from './types'
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
    const { audioSettings, messageListenerSpecs, target } = validateSettings(compilerSettings)
    const macros = getMacros(target)
    const portSpecs: PortSpecs = generatePortSpecs(messageListenerSpecs)

    const compilation: Compilation = {
        graph,
        nodeImplementations,
        audioSettings,
        messageListenerSpecs,
        portSpecs,
        engineVariableNames: generateEngineVariableNames(nodeImplementations, graph),
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
                            >((nameMap, portlet) => {
                                nameMap[portlet.id] =
                                    generateInletVariableName(
                                        node.id,
                                        portlet.id
                                    )
                                return nameMap
                            }, {})
                        ),
                        outs: createNamespace(
                            Object.values(node.outlets).reduce<
                                NodeVariableNames['outs']
                            >((nameMap, portlet) => {
                                nameMap[portlet.id] =
                                    generateOutletVariableName(
                                        node.id,
                                        portlet.id
                                    )
                                return nameMap
                            }, {})
                        ),
                        state: createNamespace(
                            nodeStateVariables.reduce<
                                NodeVariableNames['state']
                            >((nameMap, stateVariable) => {
                                nameMap[stateVariable] =
                                    generateStateVariableName(
                                        node.id,
                                        stateVariable
                                    )
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
    })

export const generateInletVariableName = (
    nodeId: PdDspGraph.NodeId,
    inletId: PdDspGraph.PortletId
) => `${assertValidNamePart(nodeId)}_INS_${assertValidNamePart(inletId)}`

export const generateOutletVariableName = (
    nodeId: PdDspGraph.NodeId,
    outletId: PdDspGraph.PortletId
) => `${assertValidNamePart(nodeId)}_OUTS_${assertValidNamePart(outletId)}`

export const generateStateVariableName = (
    nodeId: PdDspGraph.NodeId,
    localVariableName: PdDspGraph.PortletId
) =>
    `${assertValidNamePart(nodeId)}_STATE_${assertValidNamePart(
        localVariableName
    )}`

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
    const messageListenerSpecs = settings.messageListenerSpecs || {}
    if (![32, 64].includes(settings.audioSettings.bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    return {
        ...settings,
        messageListenerSpecs,
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
