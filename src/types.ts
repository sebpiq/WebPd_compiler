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

import { FS_OPERATION_FAILURE, FS_OPERATION_SUCCESS } from './constants'
import { DspGraph } from './dsp-graph'

export type fs_OperationStatus =
    | typeof FS_OPERATION_SUCCESS
    | typeof FS_OPERATION_FAILURE

export type FloatArrayConstructor = typeof Float32Array | typeof Float64Array
export type FloatArray = InstanceType<FloatArrayConstructor>

/** Type for messages sent through the control flow. */
export type Message = Array<string | number>

/** [channelCount, sampleRate, bitDepth, encodingFormat, endianness, extraOptions] */
export type SoundFileInfo = [
    number,
    number,
    number,
    string,
    'b' | 'l' | '',
    string
]

/** Type for values sent through the signal flow. */
export type Signal = number

export type CompilerTarget = 'assemblyscript' | 'javascript'

/** Code stored in string variable for later evaluation. */
export type Code = string

/** Name of a variable in generated code */
export type CodeVariableName = string

export type Module = any

export interface RawModule extends Module {}

export type PortletsIndex = {
    [nodeId: DspGraph.NodeId]: Array<DspGraph.PortletId>
}

export interface EngineMetadata {
    readonly audioSettings: Compilation['audioSettings'] & {
        sampleRate: number
        blockSize: number
    }
    compilation: {
        readonly inletCallerSpecs: Compilation['inletCallerSpecs']
        readonly outletListenerSpecs: Compilation['outletListenerSpecs']
        readonly codeVariableNames: {
            readonly inletCallers: Compilation['codeVariableNames']['inletCallers']
            readonly outletListeners: Compilation['codeVariableNames']['outletListeners']
        }
    }
}

/** Base interface for DSP engine */
export interface Engine {
    metadata: EngineMetadata

    configure: (sampleRate: number, blockSize: number) => void

    loop: (input: Array<FloatArray>, output: Array<FloatArray>) => void

    inletCallers: {
        [nodeId: DspGraph.NodeId]: {
            [inletId: DspGraph.PortletId]: (m: Message) => void
        }
    }

    outletListeners: {
        [nodeId: DspGraph.NodeId]: {
            [outletId: DspGraph.PortletId]: {
                onMessage: (message: Message) => void
            }
        }
    }

    /** API for all shared resources, global events, etc ... */
    commons: {
        getArray: (arrayName: string) => FloatArray
        setArray: (arrayName: string, array: FloatArray | Array<number>) => void
    }

    /** Filesystem API for the engine */
    fs: {
        /** Callback which the host environment must set to receive "read sound file" requests. */
        onReadSoundFile: (
            operationId: number,
            url: string,
            info: SoundFileInfo
        ) => void

        /** Callback which the host environment must set to receive "write sound file" requests. */
        onWriteSoundFile: (
            operationId: number,
            sound: Array<FloatArray>,
            url: string,
            info: SoundFileInfo
        ) => void

        /** Callback which the host environment must set to receive "read sound stream" requests. */
        onOpenSoundReadStream: (
            operationId: number,
            url: string,
            info: SoundFileInfo
        ) => void

        /** Callback which the host environment must set to receive "write sound stream" requests. */
        onOpenSoundWriteStream: (
            operationId: number,
            url: string,
            info: SoundFileInfo
        ) => void

        /** Callback which the host environment must set to receive sound stream data for an ongoing write stream. */
        onSoundStreamData: (
            operationId: number,
            sound: Array<FloatArray>
        ) => void

        /** Callback which the host environment must set to receive "close sound stream" requests. */
        onCloseSoundStream: (operationId: number, status: number) => void

        /**
         * Function for the host environment to send back the response to an engine's
         * "read sound file" request.
         *
         * @param sound Empty array if the operation has failed.
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
    }
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

export type SharedCodeGenerator = (context: {
    macros: CodeMacros
    target: CompilerTarget
    audioSettings: AudioSettings
}) => Code

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

    sharedCode?: Array<SharedCodeGenerator>
}

export type NodeImplementations = {
    [nodeType: string]: NodeImplementation<any, { [name: string]: any }>
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
