export enum PortsNames {
    SET_VARIABLE = 'setVariable',
    GET_VARIABLE = 'getVariable',
}

export type VariableNameGenerator = (
    localVariableName: string
) => PdEngine.CodeVariableName

export interface CodeGeneratorSettings extends PdEngine.Settings {
    variableNames: {
        arrays: string
        output: Array<string>
    }
}

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNameGenerators: VariableNameGenerators,
    settings: CodeGeneratorSettings
) => PdEngine.Code

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

export interface CompilerSettings extends PdEngine.Settings {
    arraysVariableName: PdEngine.CodeVariableName
}
