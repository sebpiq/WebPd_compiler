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

import { FloatArray, SoundFileInfo } from '../../run/types'
import {
    CoreRawModuleWithDependencies,
    liftString,
    lowerListOfFloatArrays,
    readListOfFloatArrays,
} from '../core/bindings-assemblyscript'
import { liftMessage, MsgRawModule } from '../msg/bindings-assemblyscript'
import { Bindings } from '../../run/types'
import {
    EngineLifecycleRawModule,
    updateWasmInOuts,
} from '../../engine-assemblyscript/run/engine-lifecycle-bindings'
import { proxyWithNameMapping } from '../../run/run-helpers'
import { EngineContext } from '../../engine-assemblyscript/run/types'
import {
    FsApi,
    FsExportsAssemblyScript,
    FsImportsAssemblyScript,
} from './types'

export interface FsRawModule {
    globals: {
        fs: FsExportsAssemblyScript
    }
}

export type FsRawModuleWithDependencies = FsRawModule &
    CoreRawModuleWithDependencies &
    EngineLifecycleRawModule &
    MsgRawModule

export const createFsBindings = (
    engineContext: EngineContext<FsRawModuleWithDependencies>
): Bindings<FsApi> => {
    const { refs, cache, metadata } = engineContext
    const fsExportedNames = metadata.compilation.variableNamesIndex.globals.fs!
    return {
        sendReadSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onReadSoundFileResponse' in fsExportedNames
                    ? (operationId, status, sound) => {
                          let soundPointer = 0
                          if (sound) {
                              soundPointer = lowerListOfFloatArrays(
                                  refs.rawModule!,
                                  cache.bitDepth,
                                  sound
                              )
                          }
                          refs.rawModule!.globals.fs.x_onReadSoundFileResponse(
                              operationId,
                              status,
                              soundPointer
                          )
                          updateWasmInOuts(engineContext)
                      }
                    : undefined,
        },

        sendWriteSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onWriteSoundFileResponse' in fsExportedNames
                    ? refs.rawModule!.globals.fs.x_onWriteSoundFileResponse
                    : undefined,
        },

        sendSoundStreamData: {
            type: 'proxy',
            value:
                'x_onSoundStreamData' in fsExportedNames
                    ? (operationId, sound) => {
                          const soundPointer = lowerListOfFloatArrays(
                              refs.rawModule!,
                              cache.bitDepth,
                              sound
                          )
                          const writtenFrameCount =
                              refs.rawModule!.globals.fs.x_onSoundStreamData(
                                  operationId,
                                  soundPointer
                              )
                          updateWasmInOuts(engineContext)
                          return writtenFrameCount
                      }
                    : undefined,
        },

        closeSoundStream: {
            type: 'proxy',
            value:
                'x_onCloseSoundStream' in fsExportedNames
                    ? refs.rawModule!.globals.fs.x_onCloseSoundStream
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
    engineContext: EngineContext<FsRawModuleWithDependencies>
): FsImportsAssemblyScript => {
    const wasmImports: FsImportsAssemblyScript = {}
    const { cache, metadata, refs } = engineContext
    const exportedNames = metadata.compilation.variableNamesIndex.globals
    if ('fs' in exportedNames) {
        const nameMapping = proxyWithNameMapping(
            wasmImports!,
            exportedNames!.fs!
        ) as FsImportsAssemblyScript
        if ('i_readSoundFile' in exportedNames.fs!) {
            nameMapping!.i_readSoundFile = (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(refs.rawModule!, urlPointer)
                const info = liftMessage(
                    refs.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                refs.engine!.globals.fs!.onReadSoundFile(operationId, url, info)
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
                    refs.rawModule!,
                    cache.bitDepth,
                    soundPointer
                ) as Array<FloatArray>
                const url = liftString(refs.rawModule!, urlPointer)
                const info = liftMessage(
                    refs.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                refs.engine!.globals.fs!.onWriteSoundFile(
                    operationId,
                    sound,
                    url!,
                    info
                )
            }
        }

        if ('i_openSoundReadStream' in exportedNames.fs!) {
            nameMapping!.i_openSoundReadStream = (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(refs.rawModule!, urlPointer)
                const info = liftMessage(
                    refs.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                // Called here because this call means that some sound buffers were allocated
                // inside the wasm module.
                updateWasmInOuts(engineContext)
                refs.engine!.globals.fs!.onOpenSoundReadStream(
                    operationId,
                    url!,
                    info
                )
            }
        }

        if ('i_openSoundWriteStream' in exportedNames.fs!) {
            nameMapping!.i_openSoundWriteStream = (
                operationId,
                urlPointer,
                infoPointer
            ) => {
                const url = liftString(refs.rawModule!, urlPointer)
                const info = liftMessage(
                    refs.rawModule!,
                    infoPointer
                ) as SoundFileInfo
                refs.engine!.globals.fs!.onOpenSoundWriteStream(
                    operationId,
                    url!,
                    info
                )
            }
        }

        if ('i_sendSoundStreamData' in exportedNames.fs!) {
            nameMapping!.i_sendSoundStreamData = (
                operationId,
                blockPointer
            ) => {
                const block = readListOfFloatArrays(
                    refs.rawModule!,
                    cache.bitDepth,
                    blockPointer
                ) as Array<FloatArray>
                refs.engine!.globals.fs!.onSoundStreamData(operationId, block)
            }
        }

        if ('i_closeSoundStream' in exportedNames.fs!) {
            nameMapping!.i_closeSoundStream = (...args) =>
                refs.engine!.globals.fs!.onCloseSoundStream(...args)
        }
    }
    return wasmImports
}
