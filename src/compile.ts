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

import { traversal, getters } from '@webpd/dsp-graph'
import { CodeGeneratorSettings, CompilerSettings } from './types'
import { NodeImplementations, PortsNames } from './types'
import variableNames, {
    generateInletVariableName,
    generateOutletVariableName,
} from './variable-names'
import { VARIABLE_NAMES } from './constants'
import { Compilation } from './compilation'

export default (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    compilerSettings: CompilerSettings
): PdEngine.SignalProcessorCode => {
    const compilation = new Compilation(
        graph,
        nodeImplementations,
        compilerSettings
    )
    return compile(compilation)
}

export const compile = (
    compilation: Compilation
): PdEngine.SignalProcessorCode => {
    const outputVariableNames: CodeGeneratorSettings['variableNames']['output'] = []
    for (
        let channel = 1;
        channel <= compilation.settings.channelCount;
        channel++
    ) {
        outputVariableNames.push(`PROCESSOR_OUTPUT${channel}`)
    }

    const codeGeneratorSettings: CodeGeneratorSettings = {
        ...compilation.settings,
        variableNames: {
            output: outputVariableNames,
            arrays: compilation.settings.arraysVariableName,
        },
    }

    const setupCode = compileSetup(
        compilation,
        traversal.breadthFirst(compilation.graph),
        codeGeneratorSettings
    )

    const loopCode = compileLoop(
        compilation,
        traversal.breadthFirst(compilation.graph),
        codeGeneratorSettings
    )

    // !!! The `SET_VARIABLE` port passes values by reference, therefore calling it twice on several
    // variables with the same array as `variableValue` for example might have unexpected effects.
    return `
        ${setupCode}
        return {
            loop: () => {
                ${loopCode}
                return [${outputVariableNames.join(', ')}]
            },
            ports: {
                ${PortsNames.GET_VARIABLE}: (variableName) => {
                    return eval(variableName)
                },
                ${PortsNames.SET_VARIABLE}: (variableName, variableValue) => {
                    eval(variableName + ' = variableValue')
                }
            }
        }
    `
}

export const compileSetup = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal,
    codeGeneratorSettings: CodeGeneratorSettings
): PdEngine.Code => {
    let code: PdEngine.Code = `
        let ${VARIABLE_NAMES.iterOutlet} = 0
        let ${VARIABLE_NAMES.frame} = -1
        const ${VARIABLE_NAMES.isNumber} = (v) => typeof v === 'number'
        ${codeGeneratorSettings.variableNames.output
            .map((n) => `let ${n} = 0`)
            .join('\n')}
    `
    const initializedPortletVariables: Set<PdEngine.CodeVariableName> = new Set()
    const initializePortletVariable = (
        portletType: PdDspGraph.PortletType,
        variableName: PdEngine.CodeVariableName
    ) => {
        if (!initializedPortletVariables.has(variableName)) {
            if (portletType === 'control') {
                code += `\nlet ${variableName} = []`
            } else {
                code += `\nlet ${variableName} = 0`
            }
        }
    }

    for (let node of graphTraversal) {
        // Initialize portlet variables
        Object.entries(node.inlets).forEach(([inletId, inlet]) => {
            initializePortletVariable(
                inlet.type,
                generateInletVariableName(node.id, inletId)
            )
        })
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            initializePortletVariable(
                outlet.type,
                generateOutletVariableName(node.id, outletId)
            )
        })

        // Custom setup code for node
        const nodeImplementation = compilation.getNodeImplementation(node.type)
        code +=
            '\n' +
            nodeImplementation.setup(
                node,
                variableNames(node),
                codeGeneratorSettings
            )
    }

    return code
}

export const compileLoop = (
    compilation: Compilation,
    graphTraversal: PdDspGraph.GraphTraversal,
    codeGeneratorSettings: CodeGeneratorSettings
): PdEngine.Code => {
    const traversalNodeIds = graphTraversal.map((node) => node.id)
    let computeCode: PdEngine.Code = `
        ${VARIABLE_NAMES.frame}++
    `
    let cleanupCode: PdEngine.Code = ''
    const cleanedUpControlVariables: Set<PdEngine.CodeVariableName> = new Set()
    const cleanUpControlVariable = (
        portletType: PdDspGraph.PortletType,
        variableName: PdEngine.CodeVariableName
    ) => {
        if (portletType === 'control') {
            if (!cleanedUpControlVariables.has(variableName)) {
                cleanupCode += `
                    if (${variableName}.length) {
                        ${variableName} = []
                    }
                `
                cleanedUpControlVariables.add(variableName)
            }
        }
    }

    for (let node of graphTraversal) {
        const nodeImplementation = compilation.getNodeImplementation(node.type)
        const variableNameGenerators = variableNames(node)

        // 1. computation of output
        computeCode += nodeImplementation.loop(
            node,
            variableNameGenerators,
            codeGeneratorSettings
        )

        Object.entries(node.sinks).forEach(([outletId, sinks]) => {
            const outletVariableName = generateOutletVariableName(
                node.id,
                outletId
            )
            sinks.forEach(({ nodeId: sinkNodeId, portletId: inletId }) => {
                if (!traversalNodeIds.includes(sinkNodeId)) {
                    return
                }
                const inletVariableName = generateInletVariableName(
                    sinkNodeId,
                    inletId
                )

                // 2. transfer output to all connected sinks downstream
                if (getters.getOutlet(node, outletId).type === 'control') {
                    computeCode += `
                        for (${VARIABLE_NAMES.iterOutlet} = 0; ${VARIABLE_NAMES.iterOutlet} < ${outletVariableName}.length; ${VARIABLE_NAMES.iterOutlet}++) {
                            ${inletVariableName}.push(${outletVariableName}[${VARIABLE_NAMES.iterOutlet}])
                        }
                    `
                } else {
                    computeCode += `\n${inletVariableName} = ${generateOutletVariableName(
                        node.id,
                        outletId
                    )}`
                }
            })
        })

        // Cleaning up control variables
        Object.entries(node.inlets).forEach(([inletId, inlet]) => {
            cleanUpControlVariable(
                inlet.type,
                generateInletVariableName(node.id, inletId)
            )
        })
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            cleanUpControlVariable(
                outlet.type,
                generateOutletVariableName(node.id, outletId)
            )
        })

        computeCode += '\n'
    }

    return computeCode + '\n' + cleanupCode
}
