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

import { DspGraph } from '@webpd/dsp-graph'
import {
    MSG_DATUM_TYPE_STRING,
    MSG_DATUM_TYPE_FLOAT,
    FS_OPERATION_FAILURE,
    FS_OPERATION_SUCCESS,
} from './constants'

export type fs_OperationStatus =
    | typeof FS_OPERATION_SUCCESS
    | typeof FS_OPERATION_FAILURE

/**
 * Type for messages sent through the control flow.
 */
export type Message = Array<string | number>

/**
 * Type for values sent through the signal flow.
 */
export type Signal = number

export type MessageDatumType =
    | typeof MSG_DATUM_TYPE_STRING
    | typeof MSG_DATUM_TYPE_FLOAT

export type CompilerTarget = 'assemblyscript' | 'javascript'

// Function to declare code snippets
export type SnippetHandler = (
    strings: TemplateStringsArray,
    ...variables: Array<string | number>
) => Code

// Code stored in string variable for later evaluation.
export type Code = string

// Name of a variable in generated code
export type CodeVariableName = string

// Map of public variable accessors for an engine
export type EngineAccessors = { [accessorName: string]: (...args: any) => any }

// Filesystem public API
export type EngineFs = {
    readSoundFileResponse: (
        operationId: number,
        status: fs_OperationStatus,
        sound?: Array<Float32Array | Float64Array>
    ) => void
}

export type EngineFsCallbacks = {
    readSound: (operationId: number, url: string, info: any) => void
    writeSound: (
        url: string,
        data: Array<Float32Array | Float64Array>,
        info: any
    ) => void
}

/**
 *  Base interface for DSP engine
 */
export interface Engine {
    configure: (sampleRate: number, blockSize: number) => void
    loop: (
        input: Array<Float32Array | Float64Array>,
        output: Array<Float32Array | Float64Array>
    ) => void
    setArray: (
        arrayName: string,
        data: Float32Array | Float64Array | Array<number>
    ) => void
    accessors: EngineAccessors
}

export interface Compilation {
    readonly target: CompilerTarget
    readonly graph: DspGraph.Graph
    readonly nodeImplementations: NodeImplementations
    readonly audioSettings: AudioSettings
    readonly accessorSpecs: AccessorSpecs
    readonly inletListenerSpecs: InletListenerSpecs
    readonly engineVariableNames: EngineVariableNames
    readonly macros: CodeMacros
    readonly snippet: SnippetHandler
}

export type CodeMacros = {
    typedVarInt: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarFloat: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarString: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarMessage: (compilation: Compilation, name: CodeVariableName) => Code
    typedVarFloatArray: (
        compilation: Compilation,
        name: CodeVariableName
    ) => Code
    typedVarMessageArray: (
        compilation: Compilation,
        name: CodeVariableName
    ) => Code
    typedVarStringArray: (
        compilation: Compilation,
        name: CodeVariableName
    ) => Code
    castToInt: (compilation: Compilation, name: CodeVariableName) => Code
    castToFloat: (compilation: Compilation, name: CodeVariableName) => Code
    functionHeader: (
        compilation: Compilation,
        ...functionArgs: Array<Code>
    ) => Code
    createMessage: (
        compilation: Compilation,
        name: CodeVariableName,
        message: Message
    ) => Code
    isMessageMatching: (
        compilation: Compilation,
        name: CodeVariableName,
        tokens: Array<number | string | MessageDatumType>
    ) => Code
    extractMessageStringTokens: (
        compilation: Compilation,
        messageVariableName: CodeVariableName,
        destinationVariableName: CodeVariableName,
    ) => Code
    readMessageStringDatum: (
        compilation: Compilation,
        name: CodeVariableName,
        tokenIndex: number | CodeVariableName
    ) => Code
    readMessageFloatDatum: (
        compilation: Compilation,
        name: CodeVariableName,
        tokenIndex: number | CodeVariableName
    ) => Code
    fillInLoopInput: (
        compilation: Compilation,
        inputChannel: number,
        destinationName: CodeVariableName
    ) => Code
    fillInLoopOutput: (
        compilation: Compilation,
        outputChannel: number,
        sourceName: CodeVariableName
    ) => Code
    // Takes a message array as input, and constructs the output message using `template` argument.
    // For example :
    //
    //     [56, '$1', 'bla', '$2-$1']
    //     transfer([89, 'bli']); // [56, 89, 'bla', 'bli-89']
    //
    messageTransfer: (
        compilation: Compilation,
        template: Array<DspGraph.NodeArgument>,
        inVariableName: CodeVariableName,
        outVariableName: CodeVariableName
    ) => Code
}

type FunctionMap = { [key: string]: (...args: any) => any }
type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : never
type OmitFirstArgFromFunctionMap<Type extends FunctionMap> = {
    [Property in keyof Type]: OmitFirstArg<Type[Property]>
}

export type WrappedCodeMacros = OmitFirstArgFromFunctionMap<CodeMacros>

export interface NodeVariableNames {
    ins: { [portletId: DspGraph.PortletId]: CodeVariableName }
    outs: { [portletId: DspGraph.PortletId]: CodeVariableName }
    state: { [key: string]: CodeVariableName }
}

export interface EngineVariableNames {
    // Namespace for individual nodes
    n: { [nodeId: DspGraph.NodeId]: NodeVariableNames }

    // Namespace for global variables
    g: {
        arrays: string
        iterOutlet: string
        iterFrame: string
        frame: string
        blockSize: string
        sampleRate: string
        output: string
        input: string
    }

    // Names of types used by the engine (e.g. especially depending on the bitdepth)
    types: {
        FloatType?: 'f32' | 'f64'
        FloatArrayType?: 'Float32Array' | 'Float64Array'
        getFloat?: 'getFloat32' | 'getFloat64'
        setFloat?: 'setFloat32' | 'setFloat64'
    }

    // Namespace for port functions
    accessors: {
        [variableName: CodeVariableName]: {
            r?: CodeVariableName
            r_length?: CodeVariableName
            r_elem?: CodeVariableName
            w?: CodeVariableName
        }
    }

    // Namespace for inlet listener callbacks
    inletListeners: {
        [nodeId: DspGraph.NodeId]: {
            [inletId: DspGraph.PortletId]: CodeVariableName
        }
    }
}

export type NodeCodeGenerator<NodeArgsType> = (
    node: DspGraph.Node<NodeArgsType>,
    variableNames: NodeVariableNames & {
        types: EngineVariableNames['types']
        globs: EngineVariableNames['g']
        macros: WrappedCodeMacros
    },
    compilation: Compilation
) => Code

export type NodeCodeSnippet<ExtraArgs extends {[variableName: string]: string} = {}> = (
    snippet: SnippetHandler, 
    variableNames: NodeVariableNames & {
        types: EngineVariableNames['types']
        globs: EngineVariableNames['g']
    } & ExtraArgs,
) => Code

export interface NodeImplementation<NodeArgsType> {
    declare?: NodeCodeGenerator<NodeArgsType>
    initialize?: NodeCodeGenerator<NodeArgsType>
    loop: NodeCodeGenerator<NodeArgsType>
    stateVariables?: Array<string>
    snippets?: { [snippetName: string]: NodeCodeSnippet }
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any>
}

export type AccessorSpecs = {
    [variableName: CodeVariableName]: {
        access: 'r' | 'w' | 'rw'
        type: DspGraph.PortletType
    }
}

export type InletListenerSpecs = {
    [nodeId: DspGraph.NodeId]: Array<DspGraph.PortletId>
}

export interface AudioSettings {
    channelCount: {
        in: number
        out: number
    }
    bitDepth: 32 | 64
}

export interface CompilerSettings {
    audioSettings: AudioSettings
    target: CompilerTarget
    inletListenerSpecs?: InletListenerSpecs
}
