export enum PortsNames {
    SET_VARIABLE = 'setVariable',
    GET_VARIABLE = 'getVariable',
}

export interface NodeVariableNames {
    ins: {[portletId: PdDspGraph.PortletId]: PdEngine.CodeVariableName},
    outs: {[portletId: PdDspGraph.PortletId]: PdEngine.CodeVariableName},
    state: {[key: string]: PdEngine.CodeVariableName},
}

export interface VariableNames {
    // Namespace for individual nodes
    n: {[nodeId: PdDspGraph.NodeId]: NodeVariableNames}
    // Namespace for global variables
    g: {
        output: Array<string>
        arrays: string
        iterOutlet: string
        frame: string
        isNumber: string
    }
}

export type VariableNameGenerator = (
    localVariableName: string
) => PdEngine.CodeVariableName

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNames: NodeVariableNames & {globs: VariableNames['g']},
    settings: CompilerSettings
) => PdEngine.Code

export interface NodeImplementation {
    setup: NodeCodeGenerator
    loop: NodeCodeGenerator
    stateVariables?: Array<string>
}

export type NodeImplementations = { [nodeType: string]: NodeImplementation }

export interface CompilerSettings extends PdEngine.Settings {
    // Name of variable that olds the collection of data arrays 
    // so they can be made accessible to nodes that need them.
    arraysVariableName: PdEngine.CodeVariableName
}
