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
export type CompilerTarget = 'assemblyscript' | 'javascript'

export type PortletsIndex = {
    [nodeId: DspGraph.NodeId]: Array<DspGraph.PortletId>
}

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
    readonly macros: CodeMacros
    readonly debug: boolean
    precompiledPortlets: {
        precompiledInlets: PortletsIndex
        precompiledOutlets: PortletsIndex
    }
}


// -------------------------------- CODE GENERATION -------------------------------- //
/** Code stored in string variable for later evaluation. */
export type Code = string

/** Name of a variable in generated code */
export type CodeVariableName = string

export type CodeMacros = {
    Var: (name: CodeVariableName, typeString: Code) => Code
    Func: (args: Array<Code>, returnType: Code) => Code
}

export interface NodeVariableNames {
    ins: { [portletId: DspGraph.PortletId]: CodeVariableName }
    outs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    snds: { [portletId: DspGraph.PortletId]: CodeVariableName }
    rcvs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    state: { [key: string]: CodeVariableName }
}

/**
 * Map of all global variable names used for compilation.
 *
 * @todo : for the sake of completeness, this should include also api functions from the core code.
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

export interface GlobalCodeGeneratorContext {
    macros: CodeMacros
    target: CompilerTarget
    audioSettings: AudioSettings
}

export type GlobalCodeGenerator = (context: GlobalCodeGeneratorContext) => Code

export interface GlobalCodeDefinitionImport {
    name: string
    args: Array<[CodeVariableName, CodeVariableName]>
    returns: CodeVariableName
}

export interface GlobalCodeDefinitionExport { name: string; targets?: Array<CompilerTarget> }

export interface GlobalCodeGeneratorWithSettings {
    codeGenerator: GlobalCodeGenerator
    exports?: Array<GlobalCodeDefinitionExport>
    imports?: Array<GlobalCodeDefinitionImport>
    dependencies?: Array<GlobalCodeDefinition>
}

export type GlobalCodeDefinition =
    | GlobalCodeGenerator
    | GlobalCodeGeneratorWithSettings

export interface NodeImplementation<
    NodeArgsType,
    NodeState = { [name: string]: string }
> {
    stateVariables?: NodeState

    declare?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        snds: NodeVariableNames['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => Code

    loop?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        ins: NodeVariableNames['ins']
        outs: NodeVariableNames['outs']
        snds: NodeVariableNames['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => Code

    messages?: (context: {
        macros: CodeMacros
        globs: CodeVariableNames['globs']
        state: { [Parameter in keyof NodeState]: string }
        snds: NodeVariableNames['snds']
        node: DspGraph.Node<NodeArgsType>
        compilation: Compilation
    }) => {
        [inletId: DspGraph.PortletId]: Code
    }

    dependencies?: Array<GlobalCodeDefinition>
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any, { [name: string]: any }>
}