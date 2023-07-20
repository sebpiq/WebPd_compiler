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
import { InternalPointer, StringPointer, MessagePointer } from './types'
import { commons_WasmExports } from './commons-bindings'
import { Engine, FloatArray, SoundFileInfo } from '../types'
import { AssemblyScriptWasmCoreModule, liftString, lowerListOfFloatArrays, readListOfFloatArrays } from './core-bindings'
import { liftMessage, msg_WasmExports } from './msg-bindings'
import { createModule } from '../engine-common/modules'

export interface fs_WasmExports extends commons_WasmExports {
    x_fs_onReadSoundFileResponse: (
        id: number,
        status: number,
        sound: InternalPointer
    ) => void
    x_fs_onWriteSoundFileResponse: (id: number, status: number) => void
    x_fs_onSoundStreamData: (id: number, block: InternalPointer) => number
    x_fs_onCloseSoundStream: (id: number, status: number) => void
}

export interface fs_WasmImports {
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

export const createFs = (
    rawModule: fs_WasmExports,
    coreModule: AssemblyScriptWasmCoreModule
): Engine['fs'] => {
    return createModule<Engine['fs']>(rawModule, {
        sendReadSoundFileResponse: {
            type: 'proxy',
            value: (operationId, status, sound) => {
                let soundPointer = 0
                if (sound) {
                    soundPointer = lowerListOfFloatArrays(
                        rawModule,
                        coreModule.bitDepth,
                        sound
                    )
                }
                rawModule.x_fs_onReadSoundFileResponse(
                    operationId,
                    status,
                    soundPointer
                )
                coreModule._updateWasmInOuts()
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
                    coreModule.bitDepth,
                    sound
                )
                const writtenFrameCount = rawModule.x_fs_onSoundStreamData(
                    operationId,
                    soundPointer
                )
                coreModule._updateWasmInOuts()
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
}

export const fsImports = (
    dependencies: { 
        fs?: Engine['fs'],
        core?: AssemblyScriptWasmCoreModule,
        rawModule?: fs_WasmExports & msg_WasmExports,
    }
): fs_WasmImports => {
    let wasmImports: fs_WasmImports = {
        i_fs_readSoundFile: (operationId, urlPointer, infoPointer) => {
            const url = liftString(dependencies.rawModule, urlPointer)
            const info = liftMessage(
                dependencies.rawModule,
                infoPointer
            ) as SoundFileInfo
            dependencies.fs.onReadSoundFile(operationId, url, info)
        },

        i_fs_writeSoundFile: (
            operationId,
            soundPointer,
            urlPointer,
            infoPointer
        ) => {
            const sound = readListOfFloatArrays(
                dependencies.rawModule,
                dependencies.core.bitDepth,
                soundPointer
            ) as Array<FloatArray>
            const url = liftString(dependencies.rawModule, urlPointer)
            const info = liftMessage(
                dependencies.rawModule,
                infoPointer
            ) as SoundFileInfo
            dependencies.fs.onWriteSoundFile(operationId, sound, url, info)
        },

        i_fs_openSoundReadStream: (
            operationId,
            urlPointer,
            infoPointer
        ) => {
            const url = liftString(dependencies.rawModule, urlPointer)
            const info = liftMessage(
                dependencies.rawModule,
                infoPointer
            ) as SoundFileInfo
            // Called here because this call means that some sound buffers were allocated
            // inside the wasm module.
            dependencies.core._updateWasmInOuts()
            dependencies.fs.onOpenSoundReadStream(operationId, url, info)
        },

        i_fs_openSoundWriteStream: (
            operationId,
            urlPointer,
            infoPointer
        ) => {
            const url = liftString(dependencies.rawModule, urlPointer)
            const info = liftMessage(
                dependencies.rawModule,
                infoPointer
            ) as SoundFileInfo
            dependencies.fs.onOpenSoundWriteStream(operationId, url, info)
        },

        i_fs_sendSoundStreamData: (operationId, blockPointer) => {
            const block = readListOfFloatArrays(
                dependencies.rawModule,
                dependencies.core.bitDepth,
                blockPointer
            ) as Array<FloatArray>
            dependencies.fs.onSoundStreamData(operationId, block)
        },

        i_fs_closeSoundStream: (...args) =>
        dependencies.fs.onCloseSoundStream(...args),
    }
    return wasmImports
}
