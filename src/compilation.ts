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
    CodeMacros,
    CompilerSettings,
    CompilerSettingsWithDefaults,
    NodeImplementation,
    NodeImplementations,
    NodeVariableNames,
    VariableNames,
} from './types'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'

export const ARRAYS_VARIABLE_NAME = 'ARRAYS'

export class Compilation {
    readonly graph: PdDspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly settings: CompilerSettingsWithDefaults
    readonly variableNames: VariableNames

    constructor(
        graph: PdDspGraph.Graph,
        nodeImplementations: NodeImplementations,
        settings: CompilerSettings
    ) {
        this.graph = graph
        this.nodeImplementations = nodeImplementations
        this.settings = validateSettings(settings)

        this.variableNames = {
            n: createNamespace(
                Object.values(graph).reduce<VariableNames['n']>(
                    (nodeMap, node) => {
                        const nodeImplementation = this.getNodeImplementation(
                            node.type
                        )
                        const nodeStateVariables =
                            nodeImplementation.stateVariables || []
                        nodeMap[node.id] = {
                            ins: createNamespace(
                                Object.values(node.inlets).reduce<
                                    NodeVariableNames['ins']
                                >((nameMap, portlet) => {
                                    nameMap[
                                        portlet.id
                                    ] = generateInletVariableName(
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
                                    nameMap[
                                        portlet.id
                                    ] = generateOutletVariableName(
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
                                    nameMap[
                                        stateVariable
                                    ] = generateStateVariableName(
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
                output: 'OUTPUT',
            },
        }
    }

    getMacros(): CodeMacros {
        let unwrappedMacros =
            this.settings.target === 'javascript' ? JS_MACROS : ASC_MACROS
        return {
            floatArrayType: unwrappedMacros.floatArrayType.bind(
                undefined,
                this
            ),
            typedVarInt: unwrappedMacros.typedVarInt.bind(undefined, this),
            typedVarFloat: unwrappedMacros.typedVarFloat.bind(undefined, this),
            typedVarString: unwrappedMacros.typedVarString.bind(
                undefined,
                this
            ),
            typedVarMessage: unwrappedMacros.typedVarMessage.bind(
                undefined,
                this
            ),
            typedVarFloatArray: unwrappedMacros.typedVarFloatArray.bind(
                undefined,
                this
            ),
            typedVarMessageArray: unwrappedMacros.typedVarMessageArray.bind(
                undefined,
                this
            ),
            castToInt: unwrappedMacros.castToInt.bind(undefined, this),
            castToFloat: unwrappedMacros.castToFloat.bind(undefined, this),
            functionHeader: unwrappedMacros.functionHeader.bind(
                undefined,
                this
            ),
            createMessage: unwrappedMacros.createMessage.bind(undefined, this),
            isMessageMatching: unwrappedMacros.isMessageMatching.bind(
                undefined,
                this
            ),
            readMessageFloatDatum: unwrappedMacros.readMessageFloatDatum.bind(
                undefined,
                this
            ),
            readMessageStringDatum: unwrappedMacros.readMessageStringDatum.bind(
                undefined,
                this
            ),
            fillInLoopOutput: unwrappedMacros.fillInLoopOutput.bind(
                undefined,
                this
            ),
        }
    }

    getNodeImplementation = (
        nodeType: PdSharedTypes.NodeType
    ): NodeImplementation => {
        const nodeImplementation = this.nodeImplementations[nodeType]
        if (!nodeImplementation) {
            throw new Error(`node ${nodeType} is not implemented`)
        }
        return nodeImplementation
    }
}

export const validateSettings = (
    settings: CompilerSettings
): CompilerSettingsWithDefaults => {
    const portSpecs = settings.portSpecs || {}
    const bitDepth = settings.bitDepth || 32
    if (![32, 64].includes(bitDepth)) {
        throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
    }
    if (settings.target === 'assemblyscript') {
        return {
            ...settings,
            bitDepth,
            portSpecs: portSpecs,
        }
    } else {
        return {
            ...settings,
            bitDepth,
            portSpecs: portSpecs,
        }
    }
}

class InvalidSettingsError extends Error {}
