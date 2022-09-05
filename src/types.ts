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

import { Compilation } from './compilation'
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

export interface CodeMacros {
    floatArrayType: () => Code
    typedVarInt: (name: CodeVariableName) => Code
    typedVarFloat: (name: CodeVariableName) => Code
    typedVarString: (name: CodeVariableName) => Code
    typedVarMessage: (name: CodeVariableName) => Code
    typedVarFloatArray: (name: CodeVariableName) => Code
    typedVarMessageArray: (name: CodeVariableName) => Code
    castToInt: (name: CodeVariableName) => Code
    castToFloat: (name: CodeVariableName) => Code
    functionHeader: (...functionArgs: Array<Code>) => Code
    createMessage: (
        name: CodeVariableName,
        message: PdSharedTypes.ControlValue
    ) => Code
    isMessageMatching: (
        name: CodeVariableName,
        tokens: Array<number | string | MessageDatumType>
    ) => Code
    readMessageStringDatum: (name: CodeVariableName, tokenIndex: number) => Code
    readMessageFloatDatum: (name: CodeVariableName, tokenIndex: number) => Code
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
        sampleRate: string
        output: string
    }
}

export type VariableNameGenerator = (
    localVariableName: string
) => CodeVariableName

export type NodeCodeGenerator = (
    node: PdDspGraph.Node,
    variableNames: NodeVariableNames & {
        globs: VariableNames['g']
        MACROS: CodeMacros
    },
    settings: Compilation
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

export interface AudioSettings {
    channelCount: number
    bitDepth: 32 | 64
}

export interface CompilerSettings {
    audioSettings: AudioSettings
    target: 'assemblyscript' | 'javascript'
    messageListenerSpecs?: MessageListenerSpecs
}