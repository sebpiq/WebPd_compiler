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
import ASC_MACROS from './engine-assemblyscript/macros'
import JS_MACROS from './engine-javascript/macros'
import {
    AudioSettings,
    CodeMacros,
    CompilerSettings,
    MessageListenerSpecs,
    NodeImplementation,
    NodeImplementations,
    NodeVariableNames,
    PortSpecs,
    VariableNames,
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
    readonly macros: typeof ASC_MACROS | typeof JS_MACROS
}

export const wrapMacros = (unwrappedMacros: typeof JS_MACROS | typeof ASC_MACROS, compilation: Compilation): CodeMacros =>
    ({
        floatArrayType: unwrappedMacros.floatArrayType.bind(
            undefined,
            compilation
        ),
        typedVarInt: unwrappedMacros.typedVarInt.bind(undefined, compilation),
        typedVarFloat: unwrappedMacros.typedVarFloat.bind(undefined, compilation),
        typedVarString: unwrappedMacros.typedVarString.bind(
            undefined,
            compilation
        ),
        typedVarMessage: unwrappedMacros.typedVarMessage.bind(
            undefined,
            compilation
        ),
        typedVarFloatArray: unwrappedMacros.typedVarFloatArray.bind(
            undefined,
            compilation
        ),
        typedVarMessageArray: unwrappedMacros.typedVarMessageArray.bind(
            undefined,
            compilation
        ),
        castToInt: unwrappedMacros.castToInt.bind(undefined, compilation),
        castToFloat: unwrappedMacros.castToFloat.bind(undefined, compilation),
        functionHeader: unwrappedMacros.functionHeader.bind(
            undefined,
            compilation
        ),
        createMessage: unwrappedMacros.createMessage.bind(undefined, compilation),
        isMessageMatching: unwrappedMacros.isMessageMatching.bind(
            undefined,
            compilation
        ),
        readMessageFloatDatum: unwrappedMacros.readMessageFloatDatum.bind(
            undefined,
            compilation
        ),
        readMessageStringDatum: unwrappedMacros.readMessageStringDatum.bind(
            undefined,
            compilation
        ),
        fillInLoopOutput: unwrappedMacros.fillInLoopOutput.bind(
            undefined,
            compilation
        ),
    })

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
