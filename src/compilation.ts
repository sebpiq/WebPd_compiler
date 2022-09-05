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

import { createNamespace } from './code-helpers'
import {
    AudioSettings,
    WrappedCodeMacros,
    CompilerSettings,
    MessageListenerSpecs,
    NodeImplementation,
    NodeImplementations,
    NodeVariableNames,
    PortSpecs,
    VariableNames,
    CodeMacros,
} from './types'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'

export const ARRAYS_VARIABLE_NAME = 'ARRAYS'

export interface Compilation {
    readonly graph: PdDspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly audioSettings: AudioSettings
    readonly portSpecs: PortSpecs
    readonly messageListenerSpecs: MessageListenerSpecs
    readonly variableNames: VariableNames  
    readonly macros: CodeMacros
}

export const wrapMacros = (
    codeMacros: CodeMacros, 
    compilation: Compilation
): WrappedCodeMacros => {
    const wrappedCodeMacros = {} as Partial<WrappedCodeMacros>
    Object.entries(codeMacros).forEach(([key, macro]) => {
        wrappedCodeMacros[key as keyof CodeMacros] = macro.bind(
            undefined,
            compilation
        )
    })
    return wrappedCodeMacros as WrappedCodeMacros
}

export const generateEngineVariableNames = (
    nodeImplementations: NodeImplementations, 
    graph: PdDspGraph.Graph
): VariableNames =>
    ({
        n: createNamespace(
            Object.values(graph).reduce<VariableNames['n']>(
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
            arrays: ARRAYS_VARIABLE_NAME,
            iterOutlet: 'O',
            iterFrame: 'F',
            frame: 'FRAME',
            blockSize: 'BLOCK_SIZE',
            sampleRate: 'SAMPLE_RATE',
            output: 'OUTPUT',
        },
    })

export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: PdSharedTypes.NodeType
): NodeImplementation => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node ${nodeType} is not implemented`)
    }
    return nodeImplementation
}

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

class InvalidSettingsError extends Error {}
