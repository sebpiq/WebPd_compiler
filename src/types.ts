import {
    Code,
    EngineSettings,
    GlobalVariableName,
} from '@webpd/engine-core/src/eval-engine/types'

export enum PortsNames {
    SET_VARIABLE = 'setVariable',
    GET_VARIABLE = 'getVariable',
}

export type VariableNameGenerator = (
    localVariableName: string
) => GlobalVariableName

export interface ProcessorSettings extends EngineSettings {
    variableNames: {
        arrays: string
        output: Array<string>
    }
}

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNameGenerators: VariableNameGenerators,
    settings: ProcessorSettings
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
