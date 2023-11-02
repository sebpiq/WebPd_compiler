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
    StringPointer,
    MessagePointer,
    EngineData,
    ForwardReferences,
} from './types'
import { CommonsRawModule } from './commons-bindings'
import { Engine, FloatArray, RawModule, SoundFileInfo } from '../../run/types'
import {
    CoreRawModule,
    liftString,
    lowerListOfFloatArrays,
    readListOfFloatArrays,
} from './core-bindings'
import { liftMessage, MsgRawModule } from './msg-bindings'
import { Bindings } from '../../run/types'
import {
    EngineLifecycleRawModule,
    updateWasmInOuts,
} from './engine-lifecycle-bindings'

export interface FsRawModule extends RawModule {
    x_fs_onReadSoundFileResponse: (
        id: number,
        status: number,
        sound: InternalPointer
    ) => void
    x_fs_onWriteSoundFileResponse: (id: number, status: number) => void
    x_fs_onSoundStreamData: (id: number, block: InternalPointer) => number
    x_fs_onCloseSoundStream: (id: number, status: number) => void
}

export type FsWithDependenciesRawModule = CoreRawModule &
    EngineLifecycleRawModule &
    CommonsRawModule &
    MsgRawModule &
    FsRawModule

export interface FsImports {
    i_fs_readSoundFile: (
        operationId: number,
        url: StringPointer,
        info: any
    ) => void
    i_fs_writeSoundFile: (
        operationId: number,
        sound: InternalPointer,
        url: StringPointer,
        info: any
    ) => void
    i_fs_openSoundReadStream: (
        operationId: number,
        url: StringPointer,
        info: MessagePointer
    ) => void
    i_fs_openSoundWriteStream: (
        operationId: number,
        url: StringPointer,
        info: MessagePointer
    ) => void
    i_fs_sendSoundStreamData: (
        operationId: number,
        block: InternalPointer
    ) => void
    i_fs_closeSoundStream: (
        operationId: number,
        operationStatus: number
    ) => void
}

export const createFsBindings = (
    rawModule: FsWithDependenciesRawModule,
    engineData: EngineData
): Bindings<Engine['fs']> => ({
    sendReadSoundFileResponse: {
        type: 'proxy',
        value: (operationId, status, sound) => {
            let soundPointer = 0
            if (sound) {
                soundPointer = lowerListOfFloatArrays(
                    rawModule,
                    engineData.bitDepth,
                    sound
                )
            }
            rawModule.x_fs_onReadSoundFileResponse(
                operationId,
                status,
                soundPointer
            )
            updateWasmInOuts(rawModule, engineData)
        },
    },

    sendWriteSoundFileResponse: {
        type: 'proxy',
        value: rawModule.x_fs_onWriteSoundFileResponse,
    },

    sendSoundStreamData: {
        type: 'proxy',
        value: (operationId, sound) => {
            const soundPointer = lowerListOfFloatArrays(
                rawModule,
                engineData.bitDepth,
                sound
            )
            const writtenFrameCount = rawModule.x_fs_onSoundStreamData(
                operationId,
                soundPointer
            )
            updateWasmInOuts(rawModule, engineData)
            return writtenFrameCount
        },
    },

    closeSoundStream: {
        type: 'proxy',
        value: rawModule.x_fs_onCloseSoundStream,
    },

    onReadSoundFile: { type: 'callback', value: () => undefined },
    onWriteSoundFile: { type: 'callback', value: () => undefined },
    onOpenSoundReadStream: { type: 'callback', value: () => undefined },
    onOpenSoundWriteStream: { type: 'callback', value: () => undefined },
    onSoundStreamData: { type: 'callback', value: () => undefined },
    onCloseSoundStream: { type: 'callback', value: () => undefined },
})

export const createFsImports = (
    forwardReferences: ForwardReferences<FsWithDependenciesRawModule>
): FsImports => {
    let wasmImports: FsImports = {
        i_fs_readSoundFile: (operationId, urlPointer, infoPointer) => {
            const url = liftString(forwardReferences.rawModule, urlPointer)
            const info = liftMessage(
                forwardReferences.rawModule,
                infoPointer
            ) as SoundFileInfo
            forwardReferences.modules.fs.onReadSoundFile(operationId, url, info)
        },

        i_fs_writeSoundFile: (
            operationId,
            soundPointer,
            urlPointer,
            infoPointer
        ) => {
            const sound = readListOfFloatArrays(
                forwardReferences.rawModule,
                forwardReferences.engineData.bitDepth,
                soundPointer
            ) as Array<FloatArray>
            const url = liftString(forwardReferences.rawModule, urlPointer)
            const info = liftMessage(
                forwardReferences.rawModule,
                infoPointer
            ) as SoundFileInfo
            forwardReferences.modules.fs.onWriteSoundFile(
                operationId,
                sound,
                url,
                info
            )
        },

        i_fs_openSoundReadStream: (operationId, urlPointer, infoPointer) => {
            const url = liftString(forwardReferences.rawModule, urlPointer)
            const info = liftMessage(
                forwardReferences.rawModule,
                infoPointer
            ) as SoundFileInfo
            // Called here because this call means that some sound buffers were allocated
            // inside the wasm module.
            updateWasmInOuts(
                forwardReferences.rawModule,
                forwardReferences.engineData
            )
            forwardReferences.modules.fs.onOpenSoundReadStream(
                operationId,
                url,
                info
            )
        },

        i_fs_openSoundWriteStream: (operationId, urlPointer, infoPointer) => {
            const url = liftString(forwardReferences.rawModule, urlPointer)
            const info = liftMessage(
                forwardReferences.rawModule,
                infoPointer
            ) as SoundFileInfo
            forwardReferences.modules.fs.onOpenSoundWriteStream(
                operationId,
                url,
                info
            )
        },

        i_fs_sendSoundStreamData: (operationId, blockPointer) => {
            const block = readListOfFloatArrays(
                forwardReferences.rawModule,
                forwardReferences.engineData.bitDepth,
                blockPointer
            ) as Array<FloatArray>
            forwardReferences.modules.fs.onSoundStreamData(operationId, block)
        },

        i_fs_closeSoundStream: (...args) =>
            forwardReferences.modules.fs.onCloseSoundStream(...args),
    }
    return wasmImports
}
