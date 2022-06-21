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
import { CompilerSettings, NodeImplementation, NodeImplementations, NodeVariableNames, VariableNames } from './types'
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
        this.settings = settings
        
        const outputVariableNames: Array<string> = []
        for (let ch = 1; ch <= settings.channelCount; ch++) {
            outputVariableNames.push(`PROCESSOR_OUTPUT${ch}`)
        }
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
                output: outputVariableNames,
                arrays: settings.arraysVariableName,
                iterOutlet: 'o',
                frame: 'frame',
                isNumber: 'isNumber',
            },
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