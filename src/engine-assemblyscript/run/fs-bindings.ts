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
import { Engine, EngineMetadata, FloatArray, RawModule, SoundFileInfo } from '../../run/types'
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
import { RawModuleWithNameMapping } from '../../run/run-helpers'

export interface FsRawModule extends RawModule {
    fs: {
        x_onReadSoundFileResponse: (
            id: number,
            status: number,
            sound: InternalPointer
        ) => void
        x_onWriteSoundFileResponse: (id: number, status: number) => void
        x_onSoundStreamData: (id: number, block: InternalPointer) => number
        x_onCloseSoundStream: (id: number, status: number) => void
    }
}

export type FsWithDependenciesRawModule = CoreRawModule &
    EngineLifecycleRawModule &
    MsgRawModule &
    FsRawModule

export interface FsImports {
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
    i_closeSoundStream?: (
        operationId: number,
        operationStatus: number
    ) => void
}

export const createFsBindings = (
    rawModule: FsWithDependenciesRawModule,
    engineData: EngineData
): Bindings<NonNullable<Engine['fs']>> => {
    const fsExportedNames = engineData.metadata.compilation.variableNamesIndex.globalCode.fs!
    return {
        sendReadSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onReadSoundFileResponse' in fsExportedNames
                    ? (operationId, status, sound) => {
                          let soundPointer = 0
                          if (sound) {
                              soundPointer = lowerListOfFloatArrays(
                                  rawModule,
                                  engineData.bitDepth,
                                  sound
                              )
                          }
                          rawModule.fs.x_onReadSoundFileResponse(
                              operationId,
                              status,
                              soundPointer
                          )
                          updateWasmInOuts(rawModule, engineData)
                      }
                    : undefined,
        },

        sendWriteSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onWriteSoundFileResponse' in fsExportedNames
                    ? rawModule.fs.x_onWriteSoundFileResponse
                    : undefined,
        },

        sendSoundStreamData: {
            type: 'proxy',
            value:
                'x_onSoundStreamData' in fsExportedNames
                    ? (operationId, sound) => {
                          const soundPointer = lowerListOfFloatArrays(
                              rawModule,
                              engineData.bitDepth,
                              sound
                          )
                          const writtenFrameCount =
                              rawModule.fs.x_onSoundStreamData(
                                  operationId,
                                  soundPointer
                              )
                          updateWasmInOuts(rawModule, engineData)
                          return writtenFrameCount
                      }
                    : undefined,
        },

        closeSoundStream: {
            type: 'proxy',
            value:
                'x_onCloseSoundStream' in fsExportedNames
                    ? rawModule.fs.x_onCloseSoundStream
                    : undefined,
        },

        onReadSoundFile: { type: 'callback', value: () => undefined },
        onWriteSoundFile: { type: 'callback', value: () => undefined },
        onOpenSoundReadStream: { type: 'callback', value: () => undefined },
        onOpenSoundWriteStream: { type: 'callback', value: () => undefined },
        onSoundStreamData: { type: 'callback', value: () => undefined },
        onCloseSoundStream: { type: 'callback', value: () => undefined },
    }
}

export const createFsImports = (
    forwardReferences: ForwardReferences<FsWithDependenciesRawModule>,
    metadata: EngineMetadata,
): FsImports => {
    const wasmImports: FsImports = {}
    const exportedNames = metadata.compilation.variableNamesIndex.globalCode
    if ('fs' in exportedNames) {
        const nameMapping = RawModuleWithNameMapping<FsImports>(wasmImports!, exportedNames!.fs!)
        if ('i_readSoundFile' in exportedNames.fs!) {
            nameMapping!.i_readSoundFile = (operationId, urlPointer, infoPointer) => {
                const url = liftString(forwardReferences.rawModule!, urlPointer)
                const info = liftMessage(
                    forwardReferences.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                forwardReferences.modules.fs!.onReadSoundFile(operationId, url, info)
            }
        }

        if ('i_writeSoundFile' in exportedNames.fs!) {
            nameMapping!.i_writeSoundFile = (
                operationId,
                soundPointer,
                urlPointer,
                infoPointer
            ) => {
                const sound = readListOfFloatArrays(
                    forwardReferences.rawModule!,
                    forwardReferences.engineData!.bitDepth,
                    soundPointer
                ) as Array<FloatArray>
                const url = liftString(forwardReferences.rawModule!, urlPointer)
                const info = liftMessage(
                    forwardReferences.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                forwardReferences.modules.fs!.onWriteSoundFile(
                    operationId,
                    sound,
                    url!,
                    info
                )
            }
        }
    
        if ('i_openSoundReadStream' in exportedNames.fs!) {
            nameMapping!.i_openSoundReadStream = (operationId, urlPointer, infoPointer) => {
                const url = liftString(forwardReferences.rawModule!, urlPointer)
                const info = liftMessage(
                    forwardReferences.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                // Called here because this call means that some sound buffers were allocated
                // inside the wasm module.
                updateWasmInOuts(
                    forwardReferences.rawModule!,
                    forwardReferences.engineData!
                )
                forwardReferences.modules.fs!.onOpenSoundReadStream(
                    operationId,
                    url!,
                    info
                )
            }
        }

        if ('i_openSoundWriteStream' in exportedNames.fs!) {
            nameMapping!.i_openSoundWriteStream = (operationId, urlPointer, infoPointer) => {
                const url = liftString(forwardReferences.rawModule!, urlPointer)
                const info = liftMessage(
                    forwardReferences.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                forwardReferences.modules.fs!.onOpenSoundWriteStream(
                    operationId,
                    url!,
                    info
                )
            }
        }
    
        if ('i_sendSoundStreamData' in exportedNames.fs!) {
            nameMapping!.i_sendSoundStreamData = (operationId, blockPointer) => {
                const block = readListOfFloatArrays(
                    forwardReferences.rawModule!,
                    forwardReferences.engineData!.bitDepth,
                    blockPointer
                ) as Array<FloatArray>
                forwardReferences.modules.fs!.onSoundStreamData(operationId, block)
            }
        }
    
        if ('i_closeSoundStream' in exportedNames.fs!) {
            nameMapping!.i_closeSoundStream = (...args) =>
                forwardReferences.modules.fs!.onCloseSoundStream(...args)
        }
    }
    return wasmImports
}
