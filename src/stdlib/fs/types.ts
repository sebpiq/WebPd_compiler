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
import {
    InternalPointer,
    MessagePointer,
    StringPointer,
} from '../../engine-assemblyscript/run/types'
import { FloatArray, fs_OperationStatus, SoundFileInfo } from '../../run/types'
import { VariableName } from '../../ast/types'

export interface FsApi {
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
    onSoundStreamData: (operationId: number, sound: Array<FloatArray>) => void

    /** Callback which the host environment must set to receive "close sound stream" requests. */
    onCloseSoundStream: (operationId: number, status: number) => void

    /**
     * Function for the host environment to send back the response to an engine's
     * "read sound file" request.
     *
     * @param sound Empty array if the operation has failed.
     */
    sendReadSoundFileResponse?: (
        operationId: number,
        status: fs_OperationStatus,
        sound: Array<FloatArray>
    ) => void

    sendWriteSoundFileResponse?: (
        operationId: number,
        status: fs_OperationStatus
    ) => void

    sendSoundStreamData?: (
        operationId: number,
        sound: Array<FloatArray>
    ) => number

    closeSoundStream?: (operationId: number, status: fs_OperationStatus) => void
}

export interface FsExportsAssemblyScript {
    x_onReadSoundFileResponse: (
        id: number,
        status: number,
        sound: InternalPointer
    ) => void
    x_onWriteSoundFileResponse: (id: number, status: number) => void
    x_onSoundStreamData: (id: number, block: InternalPointer) => number
    x_onCloseSoundStream: (id: number, status: number) => void
}

export interface FsExportsJavaScript {
    x_onReadSoundFileResponse: FsApi['sendReadSoundFileResponse']
    x_onWriteSoundFileResponse: FsApi['sendWriteSoundFileResponse']
    x_onCloseSoundStream: FsApi['closeSoundStream']
    x_onSoundStreamData: FsApi['sendSoundStreamData']
}

export interface FsImportsJavaScript {
    i_openSoundWriteStream: FsApi['onOpenSoundWriteStream']
    i_sendSoundStreamData: FsApi['onSoundStreamData']
    i_openSoundReadStream: FsApi['onOpenSoundReadStream']
    i_closeSoundStream: FsApi['onCloseSoundStream']
    i_writeSoundFile: FsApi['onWriteSoundFile']
    i_readSoundFile: FsApi['onReadSoundFile']
}

export interface FsImportsAssemblyScript {
    i_readSoundFile?: (
        operationId: number,
        url: StringPointer,
        info: any
    ) => void
    i_writeSoundFile?: (
        operationId: number,
        sound: InternalPointer,
        url: StringPointer,
        info: any
    ) => void
    i_openSoundReadStream?: (
        operationId: number,
        url: StringPointer,
        info: MessagePointer
    ) => void
    i_openSoundWriteStream?: (
        operationId: number,
        url: StringPointer,
        info: MessagePointer
    ) => void
    i_sendSoundStreamData?: (
        operationId: number,
        block: InternalPointer
    ) => void
    i_closeSoundStream?: (operationId: number, operationStatus: number) => void
}

export interface FsNamespacePublic {
    OPERATION_SUCCESS: VariableName
    OPERATION_FAILURE: VariableName
    OperationId: VariableName
    OperationStatus: VariableName
    OperationCallback: VariableName
    OperationSoundCallback: VariableName
    Url: VariableName
    SoundInfo: VariableName
    soundInfoToMessage: VariableName
    readSoundFile: VariableName
    openSoundReadStream: VariableName
    openSoundWriteStream: VariableName
    sendSoundStreamData: VariableName
    writeSoundFile: VariableName
    closeSoundStream: VariableName
}

export interface FsNamespacePrivate {
    _assertOperationExists: VariableName
    _createOperationId: VariableName
    _OPERATIONS_IDS: VariableName
    _OPERATIONS_CALLBACKS: VariableName
    _OPERATIONS_SOUND_CALLBACKS: VariableName
    _OPERATIONS_COUNTER: VariableName
    _SOUND_STREAM_BUFFERS: VariableName
    _SOUND_BUFFER_LENGTH: VariableName
}

export type FsNamespaceAll = FsNamespacePublic &
    FsNamespacePrivate &
    Record<keyof FsExportsAssemblyScript, VariableName> &
    Record<keyof FsImportsAssemblyScript, VariableName>
