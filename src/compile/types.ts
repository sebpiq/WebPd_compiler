/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd 
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { DspGraph } from '../dsp-graph'

// -------------------------------- COMPILATION -------------------------------- //
export type PortletsIndex = {
    [nodeId: DspGraph.NodeId]: Array<DspGraph.PortletId>
}

export type CompilerTarget = 'assemblyscript' | 'javascript'

export interface AudioSettings {
    channelCount: {
        in: number
        out: number
    }
    bitDepth: 32 | 64
}

export interface CompilationSettings {
    audioSettings: AudioSettings
    target: CompilerTarget
    arrays?: DspGraph.Arrays
    inletCallerSpecs?: PortletsIndex
    outletListenerSpecs?: PortletsIndex
    debug?: boolean
}

export interface Compilation {
    readonly target: CompilerTarget
    readonly graph: DspGraph.Graph
    readonly graphTraversalDeclare: DspGraph.GraphTraversal
    readonly graphTraversalLoop: DspGraph.GraphTraversal
    readonly nodeImplementations: NodeImplementations
    readonly audioSettings: AudioSettings
    readonly arrays: DspGraph.Arrays
    readonly outletListenerSpecs: PortletsIndex
    readonly inletCallerSpecs: PortletsIndex
    readonly codeVariableNames: CodeVariableNames
    readonly precompilation: Precompilation
    readonly macros: CodeMacros
    readonly debug: boolean
}

// -------------------------------- CODE GENERATION -------------------------------- //
/** Code stored in string variable for later evaluation. */
export type Code = string

/** Name of a variable in generated code */
export type CodeVariableName = string

/**
 * Macros injected in code generators so that they can be written in a generic manner.
 * Each target language supported must implement the full set of macros.
 */
export type CodeMacros = {
    Var: (name: CodeVariableName, typeString: Code) => Code
    Func: (args: Array<Code>, returnType: Code) => Code
}

export interface NodeVariableNames {
    outs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    snds: { [portletId: DspGraph.PortletId]: CodeVariableName }
    rcvs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    state: { [key: string]: CodeVariableName }
}

/**
 * Map of all global variable names used for compilation.
 *
 * @todo : for the sake of completeness, this should include also all global variables dependencies, etc ...
 */
export interface CodeVariableNames {
    /** Namespace for individual nodes */
    nodes: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    /** Namespace for global variables */
    globs: {
        /** Frame count, reinitialized at each loop start */
        iterFrame: string
        /** Frame count, never reinitialized */
        frame: string
        blockSize: string
        sampleRate: string
        output: string
        input: string
        nullMessageReceiver: string
        nullSignal: string
        /** Input argument for message receiver functions @todo : not a glob */
        m: string
    }

    /** Namespace for inlet callers */
    inletCallers: {
        [nodeId: DspGraph.NodeId]: {
            [outletId: DspGraph.PortletId]: CodeVariableName
        }
    }

    /** Namespace for outlet listeners callbacks */
    outletListeners: {
        [nodeId: DspGraph.NodeId]: {
            [outletId: DspGraph.PortletId]: CodeVariableName
        }
    }
}

export interface PrecompiledNodeCode {
    outs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    snds: { [portletId: DspGraph.PortletId]: CodeVariableName }
    rcvs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    ins: { [portletId: DspGraph.PortletId]: CodeVariableName }
}

/**
 * Precompilation for a graph, allowing mostly to implement various optimizations.
 * This map is then used in code generation to replace variables with their precompiled counterparts.
 */
export type Precompilation = {
    [nodeId: DspGraph.NodeId]: PrecompiledNodeCode
}

export interface GlobalCodeGeneratorContext {
    macros: CodeMacros
    target: CompilerTarget
    audioSettings: AudioSettings
}

/** Simplest form of generator for global code */
export type GlobalCodeGenerator = (context: GlobalCodeGeneratorContext) => Code

export interface GlobalCodeDefinitionImport {
    name: string
    args: Array<[CodeVariableName, CodeVariableName]>
    returns: CodeVariableName
}

export interface GlobalCodeDefinitionExport {
    name: string
    targets?: Array<CompilerTarget>
}

/** Generator for global code that specifies also extra settings */
export interface GlobalCodeGeneratorWithSettings {
    codeGenerator: GlobalCodeGenerator
    exports?: Array<GlobalCodeDefinitionExport>
    imports?: Array<GlobalCodeDefinitionImport>
    dependencies?: Array<GlobalCodeDefinition>
}

export type GlobalCodeDefinition =
    | GlobalCodeGenerator
    | GlobalCodeGeneratorWithSettings

/** Implementation of a graph node type */
export interface NodeImplementation<
    NodeArgsType,
    NodeState = { [name: string]: string }
> {
    /**
     * A map of state variables for the node type.
     * Each state variable will be stored into a global variable
     * which is assigned a unique name.
     */
    stateVariables?: NodeState

    /**
     * Generates code for variables declaration for a given node instance.
     * This is typically used to declare and initialize state variables.
     */
    generateDeclarations?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        snds: PrecompiledNodeCode['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => Code

    /**
     * Generates the code that will be ran each iteration of the loop for that node instance.
     * Typically reads from ins, runs some calculations, and write results to outs.
     * 
     * @see generateInlineLoop for more complexe loop code generation.
     */
    generateLoop?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        ins: PrecompiledNodeCode['ins']
        outs: PrecompiledNodeCode['outs']
        snds: PrecompiledNodeCode['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => Code

    /**
     * Generates the code that will be ran each iteration of the loop for that node instance.
     * This should only generate an expression without side effects : no variable declaration, 
     * no variable assignment, ... Therefore, this can only be used if the node has a unique 
     * signal outlet.
     * 
     * @see generateLoop for more complexe loop code generation.
     */
    generateLoopInline?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        ins: PrecompiledNodeCode['ins']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => Code

    /**
     * Generate code for message receivers for a given node instance.
     */
    generateMessageReceivers?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        snds: PrecompiledNodeCode['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => {
        [inletId: DspGraph.PortletId]: Code
    }

    /** List of dependencies for this node type */
    dependencies?: Array<GlobalCodeDefinition>
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any, { [name: string]: any }>
}
