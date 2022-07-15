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

// Code stored in string variable for later evaluation.
export type Code = string

// Name of a variable in generated code
export type CodeVariableName = string

// JavaScript Code that allows to create a JavaScriptEngine when evaled
export type JavaScriptEngineCode = Code

// AssemblyScript Code that allows to create an AssemblyScriptWasmEngine when compiled 
// with the AssemblyScript compiler
export type AssemblyScriptEngineCode = Code

export interface CodeMacros {
    declareInt: (name: CodeVariableName, value: number | string) => Code
    declareIntConst: (name: CodeVariableName, value: number | string) => Code
    declareFloat: (name: CodeVariableName, value: number | string) => Code
    declareFloatArray: (name: CodeVariableName, size: number) => Code
    declareMessageArray: (name: CodeVariableName) => Code
    fillInLoopOutput: (channel: number, value: CodeVariableName) => Code
}

export interface NodeVariableNames {
    ins: { [portletId: PdDspGraph.PortletId]: CodeVariableName }
    outs: { [portletId: PdDspGraph.PortletId]: CodeVariableName }
    state: { [key: string]: CodeVariableName }
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
) => CodeVariableName

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNames: NodeVariableNames & { globs: VariableNames['g'], MACROS: CodeMacros },
    settings: CompilerSettings
) => Code

export interface NodeImplementation {
    setup: NodeCodeGenerator
    loop: NodeCodeGenerator
    stateVariables?: Array<string>
}

export type NodeImplementations = { [nodeType: string]: NodeImplementation }

interface BaseCompilerSettings {
    sampleRate: number
    channelCount: number
    // Name of variable that olds the collection of data arrays
    // so they can be made accessible to nodes that need them.
    arraysVariableName: CodeVariableName
}

interface CompilerOptions {
    // Ports allowing to read / write variables from the engine
    ports: {[variableName: CodeVariableName]: {
        access: 'r' | 'w' | 'rw',
        type: 'float' | 'messages'
    }}
}

interface AssemblyScriptCompilerOptions {
    bitDepth: 32 | 64
}

interface JavaScriptCompilerOptions {}

interface BaseAssemblyScriptCompilerSettings extends BaseCompilerSettings {
    target: 'assemblyscript'
}

interface BaseJavaScriptCompilerSettings extends BaseCompilerSettings {
    target: 'javascript'
}

type AssemblyScriptCompilerSettings = 
    BaseAssemblyScriptCompilerSettings 
    & Partial<AssemblyScriptCompilerOptions> 
    & Partial<CompilerOptions>
type JavaScriptCompilerSettings = 
    BaseJavaScriptCompilerSettings 
    & Partial<JavaScriptCompilerOptions> 
    & Partial<CompilerOptions>

// External type of settings passed to the compilation by library user
export type CompilerSettings = 
    AssemblyScriptCompilerSettings | JavaScriptCompilerSettings

export type AssemblyScriptCompilerSettingsWithDefaults = 
    BaseAssemblyScriptCompilerSettings 
    & AssemblyScriptCompilerOptions
    & CompilerOptions
export type JavaScriptCompilerSettingsWithDefaults = 
    BaseJavaScriptCompilerSettings 
    & JavaScriptCompilerOptions
    & CompilerOptions

// Internal type of setting after validation and settings defaults
export type CompilerSettingsWithDefaults = 
    AssemblyScriptCompilerSettingsWithDefaults | JavaScriptCompilerSettingsWithDefaults