import { EngineAttributes } from '@webpd/engine-core/src/types'

export enum PortsNames {
    SET_VARIABLE = 'setVariable',
    GET_VARIABLE = 'getVariable',
}

// JS Code stored in string variable for later evaluation.
export type Code = string

// All variables are global in generated code
export type GlobalVariableName = string

export type VariableNameGenerator = (
    localVariableName: string
) => GlobalVariableName

export interface JsEvalEngineAttributes extends EngineAttributes {
    engineOutputVariableNames: Array<string>
    engineArraysVariableName: string
}

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNameGenerators: VariableNameGenerators,
    settings: JsEvalEngineAttributes
) => Code

export interface VariableNameGenerators {
    state: VariableNameGenerator
    ins: VariableNameGenerator
    outs: VariableNameGenerator
}

export interface NodeImplementation {
    setup: NodeCodeGenerator
    loop: NodeCodeGenerator
}

export type NodeImplementations = { [nodeType: string]: NodeImplementation }
