export enum PortsNames {
    SET_VARIABLE = 'setVariable',
    GET_VARIABLE = 'getVariable',
}

export interface CodeMacros {
    declareInt: (name: PdEngine.CodeVariableName, value: number | string) => PdEngine.Code,
    declareIntConst: (name: PdEngine.CodeVariableName, value: number | string) => PdEngine.Code,
    declareSignal: (name: PdEngine.CodeVariableName, value: number | string) => PdEngine.Code,
    declareMessageArray: (name: PdEngine.CodeVariableName) => PdEngine.Code,
    fillInLoopOutput: (channel: number, value: PdEngine.CodeVariableName) => PdEngine.Code,
}

export interface NodeVariableNames {
    ins: { [portletId: PdDspGraph.PortletId]: PdEngine.CodeVariableName }
    outs: { [portletId: PdDspGraph.PortletId]: PdEngine.CodeVariableName }
    state: { [key: string]: PdEngine.CodeVariableName }
}

export interface VariableNames {
    // Namespace for individual nodes
    n: { [nodeId: PdDspGraph.NodeId]: NodeVariableNames }
    // Namespace for global variables
    g: {
        arrays: string
        iterOutlet: string
        iterFrame: string
        frame: string
        blockSize: string
        output: string
    }
}

export type VariableNameGenerator = (
    localVariableName: string
) => PdEngine.CodeVariableName

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNames: NodeVariableNames & { globs: VariableNames['g'], MACROS: CodeMacros },
    settings: CompilerSettings
) => PdEngine.Code

export interface NodeImplementation {
    setup: NodeCodeGenerator
    loop: NodeCodeGenerator
    stateVariables?: Array<string>
}

export type NodeImplementations = { [nodeType: string]: NodeImplementation }

interface BaseCompilerSettings extends PdEngine.Settings {
    // Name of variable that olds the collection of data arrays
    // so they can be made accessible to nodes that need them.
    arraysVariableName: PdEngine.CodeVariableName
}

interface AssemblyScriptCompilerOptions {
    bitDepth: 32 | 64
}

interface BaseAssemblyScriptCompilerSettings extends BaseCompilerSettings {
    target: 'assemblyscript'
}

interface BaseJavaScriptCompilerSettings extends BaseCompilerSettings {
    target: 'javascript'
}

type AssemblyScriptCompilerSettings = BaseAssemblyScriptCompilerSettings & Partial<AssemblyScriptCompilerOptions>
type JavaScriptCompilerSettings = BaseJavaScriptCompilerSettings
export type CompilerSettings = AssemblyScriptCompilerSettings | JavaScriptCompilerSettings

export type AssemblyScriptCompilerSettingsWithDefaults = BaseAssemblyScriptCompilerSettings & AssemblyScriptCompilerOptions
export type JavaScriptCompilerSettingsWithDefaults = JavaScriptCompilerSettings
export type CompilerSettingsWithDefaults = AssemblyScriptCompilerSettingsWithDefaults | JavaScriptCompilerSettingsWithDefaults