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

import {
    MESSAGE_DATUM_TYPE_STRING,
    MESSAGE_DATUM_TYPE_FLOAT,
} from './constants'

export type MessageDatumType =
    | typeof MESSAGE_DATUM_TYPE_STRING
    | typeof MESSAGE_DATUM_TYPE_FLOAT

// Code stored in string variable for later evaluation.
export type Code = string

// Name of a variable in generated code
export type CodeVariableName = string

// Map of public engine ports for accessing data inside the engine
export type EnginePorts = { [portName: string]: (...args: any) => any }

export interface Compilation {
    readonly graph: PdDspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly audioSettings: AudioSettings
    readonly portSpecs: PortSpecs
    readonly messageListenerSpecs: MessageListenerSpecs
    readonly engineVariableNames: EngineVariableNames
    readonly macros: CodeMacros
}

export type CodeMacros = {
    floatArrayType: (compilation: Compilation) => Code
    typedVarInt: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarFloat: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarString: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarMessage: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarFloatArray: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarMessageArray: (compilation: Compilation, name: CodeVariableName) => Code
    castToInt: (compilation: Compilation, name: CodeVariableName) => Code
    castToFloat: (compilation: Compilation, name: CodeVariableName) => Code
    functionHeader: (compilation: Compilation, ...functionArgs: Array<Code>) => Code
    createMessage: (compilation: Compilation, 
        name: CodeVariableName,
        message: PdSharedTypes.ControlValue
    ) => Code
    isMessageMatching: (compilation: Compilation, 
        name: CodeVariableName,
        tokens: Array<number | string | MessageDatumType>
    ) => Code
    readMessageStringDatum: (compilation: Compilation, name: CodeVariableName, tokenIndex: number) => Code
    readMessageFloatDatum: (compilation: Compilation, name: CodeVariableName, tokenIndex: number) => Code
    fillInLoopOutput: (compilation: Compilation, channel: number, value: CodeVariableName) => Code
}

type FunctionMap = {[key: string]: (...args: any) => any}
type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
type OmitFirstArgFromFunctionMap<Type extends FunctionMap> = {
    [Property in keyof Type]: OmitFirstArg<Type[Property]>
}

export type WrappedCodeMacros = OmitFirstArgFromFunctionMap<CodeMacros>

export interface NodeVariableNames {
    ins: { [portletId: PdDspGraph.PortletId]: CodeVariableName }
    outs: { [portletId: PdDspGraph.PortletId]: CodeVariableName }
    state: { [key: string]: CodeVariableName }
}

export interface EngineVariableNames {
    // Namespace for individual nodes
    n: { [nodeId: PdDspGraph.NodeId]: NodeVariableNames }

    // Namespace for global variables
    g: {
        arrays: string
        iterOutlet: string
        iterFrame: string
        frame: string
        blockSize: string
        sampleRate: string
        output: string
    }

    // Namespace for port functions
    ports: { [variableName: CodeVariableName]: 
        { r?: CodeVariableName, w?: CodeVariableName }
    }

    // Namespace for message listener callbacks
    messageListeners: { [variableName: CodeVariableName]: CodeVariableName }
}

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNames: NodeVariableNames & {
        globs: EngineVariableNames['g']
        MACROS: WrappedCodeMacros
    },
    compilation: Compilation
) => Code

export interface NodeImplementation {
    declare?: NodeCodeGenerator
    initialize?: NodeCodeGenerator
    loop: NodeCodeGenerator
    stateVariables?: Array<string>
}

export type NodeImplementations = { [nodeType: string]: NodeImplementation }

export type PortSpecs = {
    [variableName: CodeVariableName]: {
        access: 'r' | 'w' | 'rw'
        type: 'float' | 'messages'
    }
}

export type MessageListener = (messageArray: Array<PdSharedTypes.ControlValue>) => void

export type MessageListenerSpecs = {
    [variableName: CodeVariableName]: MessageListener
}

export type MessageListeners = {
    [nodeId: PdDspGraph.NodeId]: {
        [inletId: PdDspGraph.PortletId]: MessageListener
    }
}

export interface AudioSettings {
    channelCount: number
    bitDepth: 32 | 64
}

export interface CompilerSettings {
    audioSettings: AudioSettings
    target: 'assemblyscript' | 'javascript'
    messageListeners?: MessageListeners
}