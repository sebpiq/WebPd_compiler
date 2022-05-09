import { DspEngineString } from '@webpd/engine-core/src/eval-engine/types'
import traverseGraph, { GraphTraversal } from '@webpd/engine-core/src/traverse-graph'
import { Code, GlobalVariableName, JsEvalEngineAttributes } from './types'
import { ENGINE_ARRAYS_VARIABLE_NAME } from '@webpd/engine-core/src/eval-engine/constants'
import { EngineAttributes } from '@webpd/engine-core/src/types'
import { NodeImplementations, PortsNames } from './types'
import variableNames, { generateInletVariableName, generateOutletVariableName } from './variable-names'

const ITER_OUTLET_VARIABLE_NAME = 'o'

export default async (
    graph: PdDspGraph.Graph,
    nodeImplementations: NodeImplementations,
    settings: EngineAttributes
): Promise<DspEngineString> => {
    const engineOutputVariableNames: JsEvalEngineAttributes['engineOutputVariableNames'] = []
    for (let channel = 1; channel <= settings.channelCount; channel++) {
        engineOutputVariableNames.push(`ENGINE_OUTPUT${channel}`)
    }
    
    const jsEvalSettings: JsEvalEngineAttributes = {
        ...settings,
        engineOutputVariableNames,
        engineArraysVariableName: ENGINE_ARRAYS_VARIABLE_NAME,
    }

    const setupCode = await generateSetup(
        traverseGraph(graph),
        nodeImplementations,
        jsEvalSettings
    )

    const loopCode = await generateLoop(
        traverseGraph(graph),
        nodeImplementations,
        jsEvalSettings
    )

    return `
        ${setupCode}
        return {
            loop: () => { 
                ${loopCode}
                return [${engineOutputVariableNames.join(', ')}]
            },
            ports: {
                ${PortsNames.SET_VARIABLE}: (variableName, variableValue) => {
                    eval(variableName + ' = variableValue')
                }
            }
        }
    `
}

export const generateSetup = async (
    graphTraversal: GraphTraversal,
    nodeImplementations: NodeImplementations,
    jsEvalSettings: JsEvalEngineAttributes
): Promise<Code> => {
    let code: Code = `
        let ${ITER_OUTLET_VARIABLE_NAME} = 0
        ${jsEvalSettings.engineOutputVariableNames.map(n => `let ${n} = 0`).join('\n')}
    `
    const initializedPortletVariables: Set<GlobalVariableName> = new Set()
    const initializePortletVariable = (
        portletType: PdSharedTypes.PortletType,
        variableName: GlobalVariableName,
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
            initializePortletVariable(inlet.type, generateInletVariableName(
                node.id, 
                inletId
            ))
        })
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            initializePortletVariable(outlet.type, generateOutletVariableName(
                node.id, 
                outletId
            ))
        })

        // Custom setup code for node
        const nodeImplementation = _getNodeImplementation(nodeImplementations, node.type)
        code +=
            '\n' + nodeImplementation.setup(node, variableNames(node), jsEvalSettings)
    }
    
    return Promise.resolve(code)
}

export const generateLoop = async (
    graphTraversal: GraphTraversal,
    nodeImplementations: NodeImplementations,
    jsEvalSettings: JsEvalEngineAttributes
): Promise<Code> => {
    let computeCode: Code = ''
    let cleanupCode: Code = ''
    const cleanedUpControlVariables: Set<GlobalVariableName> = new Set()
    const cleanUpControlVariable = (
        portletType: PdSharedTypes.PortletType,
        variableName: GlobalVariableName,
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
        const nodeImplementation = _getNodeImplementation(nodeImplementations, node.type)
        const variableNameGenerators = variableNames(node)

        // 1. computation of output
        computeCode += nodeImplementation.loop(node, variableNameGenerators, jsEvalSettings)

        Object.entries(node.sinks).forEach(([outletId, sinks]) => {
            const outletVariableName = generateOutletVariableName(
                node.id, 
                outletId
            )
            sinks.forEach(({ nodeId: sinkNodeId, portlet: inletId }) => {
                const inletVariableName = generateInletVariableName(
                    sinkNodeId,
                    inletId
                )

                // 2. transfer output to all connected sinks downstream
                if (node.outlets[outletId].type === 'control') {
                    computeCode += `
                        for (${ITER_OUTLET_VARIABLE_NAME} = 0; ${ITER_OUTLET_VARIABLE_NAME} < ${outletVariableName}.length; ${ITER_OUTLET_VARIABLE_NAME}++) {
                            ${inletVariableName}.push(${outletVariableName}[${ITER_OUTLET_VARIABLE_NAME}])
                        }
                    `
                } else {
                    computeCode += `\n${inletVariableName} = ${generateOutletVariableName(node.id, outletId)}`
                }
            })
        })

        // Cleaning up control variables
        Object.entries(node.inlets).forEach(([inletId, inlet]) => {
            cleanUpControlVariable(inlet.type, generateInletVariableName(
                node.id, 
                inletId
            ))
        })
        Object.entries(node.outlets).forEach(([outletId, outlet]) => {
            cleanUpControlVariable(outlet.type, generateOutletVariableName(
                node.id,
                outletId
            ))
        })

        computeCode += '\n'
    }

    return Promise.resolve(computeCode + '\n' + cleanupCode)
}

const _getNodeImplementation = (nodeImplementations: NodeImplementations, nodeType: PdSharedTypes.NodeType) => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node ${nodeType} is not implemented`)
    }
    return nodeImplementation
}