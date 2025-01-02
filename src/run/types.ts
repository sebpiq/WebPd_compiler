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
import { CompilationSettings, VariableNamesIndex } from '../compile/types'
import { FsApi } from '../stdlib/fs/types'
import {
    FS_OPERATION_FAILURE,
    FS_OPERATION_SUCCESS,
} from '../stdlib/fs/constants'
import { CommonsApi } from '../stdlib/commons/types'
import { CustomMetadataType } from '../types'

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
export type BindingSpec<ValueType> =
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

export type MessageToken = string | number

/** Type for messages sent through the control flow. */
export type Message = Array<MessageToken>

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
    readonly customMetadata: CustomMetadataType
    readonly settings: {
        readonly audio: CompilationSettings['audio'] & {
            // Assigned at run time through `initialize`
            sampleRate: number
            blockSize: number
        }
        readonly io: CompilationSettings['io']
    }
    readonly compilation: {
        readonly variableNamesIndex: {
            readonly io: VariableNamesIndex['io']
            readonly globals: VariableNamesIndex['globals']
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
                [inletId: DspGraph.PortletId]: (message: Message) => void
            }
        }

        messageSenders: {
            [nodeId: DspGraph.NodeId]: {
                [outletId: DspGraph.PortletId]: (message: Message) => void
            }
        }
    }

    globals: {
        /** API for all shared resources, global events, etc ... */
        commons: CommonsApi

        /** Filesystem API for the engine */
        fs?: FsApi
    }
}
