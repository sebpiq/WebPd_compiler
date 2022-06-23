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
import AS_MACROS from './macros/assemblyscript'
import JS_MACROS from './macros/javascript'
import { CodeMacros, CompilerSettings, CompilerSettingsWithDefaults, NodeImplementation, NodeImplementations, NodeVariableNames, VariableNames } from './types'
import { generateInletVariableName, generateOutletVariableName, generateStateVariableName } from './variable-names'

export class Compilation {
    readonly graph: PdDspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly settings: CompilerSettings
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
            n: createNamespace(Object.values(graph).reduce<VariableNames["n"]>((nodeMap, node) => {
                const nodeImplementation = this.getNodeImplementation(node.type)
                const nodeStateVariables = nodeImplementation.stateVariables || []
                nodeMap[node.id] = {
                    ins: createNamespace(Object.values(node.inlets).reduce<NodeVariableNames['ins']>((nameMap, portlet) => {
                        nameMap[portlet.id] = generateInletVariableName(node.id, portlet.id)
                        return nameMap
                    }, {})),
                    outs: createNamespace(Object.values(node.outlets).reduce<NodeVariableNames['outs']>((nameMap, portlet) => {
                        nameMap[portlet.id] = generateOutletVariableName(node.id, portlet.id)
                        return nameMap
                    }, {})),
                    state: createNamespace(nodeStateVariables.reduce<NodeVariableNames['state']>((nameMap, stateVariable) => {
                        nameMap[stateVariable] = generateStateVariableName(node.id, stateVariable)
                        return nameMap
                    }, {})),
                }
                return nodeMap
            }, {})),
            g: {
                arrays: settings.arraysVariableName,
                iterOutlet: 'O',
                iterFrame: 'F',
                frame: 'FRAME',
                blockSize: 'BLOCK_SIZE',
                output: 'OUTPUT',
            },
        }
    }

    getMacros(): CodeMacros {
        let unwrappedMacros = this.settings.target === 'javascript' ? JS_MACROS : AS_MACROS
        return {
            declareInt: unwrappedMacros.declareInt.bind(undefined, this),
            declareIntConst: unwrappedMacros.declareIntConst.bind(undefined, this),
            declareSignal: unwrappedMacros.declareSignal.bind(undefined, this),
            declareMessageArray: unwrappedMacros.declareMessageArray.bind(undefined, this),
            fillInLoopOutput: unwrappedMacros.fillInLoopOutput.bind(undefined, this),
        }
    }

    getNodeImplementation = (nodeType: PdSharedTypes.NodeType): NodeImplementation => {
        const nodeImplementation = this.nodeImplementations[nodeType]
        if (!nodeImplementation) {
            throw new Error(`node ${nodeType} is not implemented`)
        }
        return nodeImplementation
    }
}

export const validateSettings = (settings: CompilerSettings): CompilerSettingsWithDefaults => {
    if (settings.target === 'assemblyscript') {
        const bitDepth = settings.bitDepth || 32
        if (![32, 64].includes(bitDepth)) {
            throw new InvalidSettingsError(`"bitDepth" can be only 32 or 64`)
        }
        return {
            ...settings,
            bitDepth
        }
    }
    return settings
}

class InvalidSettingsError extends Error {}