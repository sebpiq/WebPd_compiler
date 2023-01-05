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
import { FS_OPERATION_FAILURE, FS_OPERATION_SUCCESS } from './constants'

export type fs_OperationStatus =
    | typeof FS_OPERATION_SUCCESS
    | typeof FS_OPERATION_FAILURE

export type FloatArray = Float32Array | Float64Array

/**
 * Type for messages sent through the control flow.
 */
export type Message = Array<string | number>

/**
 * [channelCount]
 */
export type SoundFileInfo = [number]

/**
 * Type for values sent through the signal flow.
 */
export type Signal = number

export type CompilerTarget = 'assemblyscript' | 'javascript'

// Code stored in string variable for later evaluation.
export type Code = string

// Name of a variable in generated code
export type CodeVariableName = string

/**
 *  Base interface for DSP engine
 */
export interface Engine {
    configure: (sampleRate: number, blockSize: number) => void
    loop: (
        input: Array<FloatArray>,
        output: Array<FloatArray>
    ) => void
    setArray: (
        arrayName: string,
        data: FloatArray | Array<number>
    ) => void

    // Map of public variable accessors for an engine
    accessors: { [accessorName: string]: (...args: any) => any }

    // Inlet listener callbacks
    inletListeners: {
        [nodeId: DspGraph.NodeId]: {
            [portletId: DspGraph.PortletId]: {
                onMessages: (messages: Array<Message>) => void
            }
        }
    }

    // Filesystem API for the engine
    fs: {
        /**
         *
         * @param operationId
         * @param status
         * @param sound will be an empty array if operation has failed
         * @returns
         */
        sendReadSoundFileResponse: (
            operationId: number,
            status: fs_OperationStatus,
            sound: Array<FloatArray>
        ) => void

        sendWriteSoundFileResponse: (
            operationId: number,
            status: fs_OperationStatus
        ) => void

        sendSoundStreamData: (
            operationId: number,
            sound: Array<FloatArray>
        ) => number

        closeSoundStream: (
            operationId: number,
            status: fs_OperationStatus
        ) => void

        // Callbacks
        onReadSoundFile: (
            operationId: number,
            url: string,
            info: SoundFileInfo,
        ) => void

        onWriteSoundFile: (
            operationId: number,
            sound: Array<FloatArray>,
            url: string,
            info: SoundFileInfo,
        ) => void

        onOpenSoundReadStream: (
            operationId: number,
            url: string,
            info: SoundFileInfo,
        ) => void

        onOpenSoundWriteStream: (
            operationId: number,
            url: string,
            info: SoundFileInfo,
        ) => void

        onSoundStreamData: (
            operationId: number,
            sound: Array<FloatArray>
        ) => void

        onCloseSoundStream: (operationId: number, status: number) => void
    }
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
}

export type CodeMacros = {
    typedVar: (name: CodeVariableName, typeString: Code) => Code
    typedFuncHeader: (args: Array<Code>, returnType: Code) => Code
}

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
        Int?: 'i32'
        Float?: 'f32' | 'f64'
        FloatArray?: 'Float32Array' | 'Float64Array'
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
        macros: CodeMacros
    },
    compilation: Compilation
) => Code

export interface NodeImplementation<NodeArgsType> {
    declare?: NodeCodeGenerator<NodeArgsType>
    initialize?: NodeCodeGenerator<NodeArgsType>
    loop: NodeCodeGenerator<NodeArgsType>
    stateVariables?: Array<string>
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
