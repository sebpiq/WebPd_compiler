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
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from '../stdlib/fs'
import { DspGraph } from '../dsp-graph'
import { CompilationSettings } from '../compile/types'
import { Precompilation, PrecompiledCode } from '../compile/precompile/types'

/** Type for a module without bindings */
export interface RawModule {}

/** Type for a module with bindings */
export interface Module {}

interface BindingSpecRaw {
    type: 'raw'
}
interface BindingSpecBinding<ValueType> {
    type: 'proxy'
    value: ValueType
}
interface BindingSpecCallback<ValueType> {
    type: 'callback'
    value: ValueType
}
type BindingSpec<ValueType> =
    | BindingSpecRaw
    | BindingSpecBinding<ValueType>
    | BindingSpecCallback<ValueType>

/** Thin wrapper around a RawModule that makes it easier to be consumed by a third party */
export type Bindings<ModuleType> = {
    [Property in keyof ModuleType]: BindingSpec<ModuleType[Property]>
}

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

export interface EngineMetadata {
    readonly libVersion: string
    readonly audioSettings: CompilationSettings['audio'] & {
        sampleRate: number
        blockSize: number
    }
    readonly compilation: {
        readonly io: CompilationSettings['io']
        readonly variableNamesIndex: {
            readonly io: PrecompiledCode['variableNamesIndex']['io']
        }
    }
}

/** Base interface for DSP engine */
export interface Engine {
    metadata: EngineMetadata

    initialize: (sampleRate: number, blockSize: number) => void

    dspLoop: (input: Array<FloatArray>, output: Array<FloatArray>) => void

    io: {
        messageReceivers: {
            [nodeId: DspGraph.NodeId]: {
                [inletId: DspGraph.PortletId]: (m: Message) => void
            }
        }
    
        messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: {
                    onMessage: (message: Message) => void
                }
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

        /**
         * Callback which the host environment must set to receive "write sound file" requests.
         *
         * @param sound - this data needs to be copied or handled immediately,
         * as the engine might reuse or garbage collect the original array.
         */
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

        /**
         * Callback which the host environment must set to receive sound stream data for an ongoing write stream.
         *
         * @param sound - this data needs to be copied or handled immediately,
         * as the engine might reuse or garbage collect the original array.
         */
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
