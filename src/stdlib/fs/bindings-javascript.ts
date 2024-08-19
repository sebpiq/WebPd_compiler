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
import { EngineLifecycleRawModule } from '../../engine-javascript/run'
import { proxyAsModuleWithBindings } from '../../run/run-helpers'
import { FsApi, FsExportsJavaScript, FsImportsJavaScript } from './types'

export interface FsRawModule extends EngineLifecycleRawModule {
    globals: {
        fs: FsExportsJavaScript & FsImportsJavaScript
    }
}

export const createFsModule = (rawModule: FsRawModule): FsApi => {
    const fsExportedNames =
        rawModule.metadata.compilation.variableNamesIndex.globals.fs!
    const fs = proxyAsModuleWithBindings<NonNullable<FsApi>>(rawModule, {
        onReadSoundFile: { type: 'callback', value: () => undefined },
        onWriteSoundFile: { type: 'callback', value: () => undefined },
        onOpenSoundReadStream: { type: 'callback', value: () => undefined },
        onOpenSoundWriteStream: { type: 'callback', value: () => undefined },
        onSoundStreamData: { type: 'callback', value: () => undefined },
        onCloseSoundStream: { type: 'callback', value: () => undefined },
        sendReadSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onReadSoundFileResponse' in fsExportedNames
                    ? rawModule.globals.fs.x_onReadSoundFileResponse
                    : undefined,
        },
        sendWriteSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onWriteSoundFileResponse' in fsExportedNames
                    ? rawModule.globals.fs.x_onWriteSoundFileResponse
                    : undefined,
        },
        // should register the operation success { bitDepth: 32, target: 'javascript' }
        sendSoundStreamData: {
            type: 'proxy',
            value:
                'x_onSoundStreamData' in fsExportedNames
                    ? rawModule.globals.fs.x_onSoundStreamData
                    : undefined,
        },
        closeSoundStream: {
            type: 'proxy',
            value:
                'x_onCloseSoundStream' in fsExportedNames
                    ? rawModule.globals.fs.x_onCloseSoundStream
                    : undefined,
        },
    })

    if ('i_openSoundWriteStream' in fsExportedNames) {
        rawModule.globals.fs.i_openSoundWriteStream = (
            ...args: Parameters<NonNullable<FsApi>['onOpenSoundWriteStream']>
        ) => fs.onOpenSoundWriteStream(...args)
    }
    if ('i_sendSoundStreamData' in fsExportedNames) {
        rawModule.globals.fs.i_sendSoundStreamData = (
            ...args: Parameters<NonNullable<FsApi>['onSoundStreamData']>
        ) => fs.onSoundStreamData(...args)
    }
    if ('i_openSoundReadStream' in fsExportedNames) {
        rawModule.globals.fs.i_openSoundReadStream = (
            ...args: Parameters<NonNullable<FsApi>['onOpenSoundReadStream']>
        ) => fs.onOpenSoundReadStream(...args)
    }
    if ('i_closeSoundStream' in fsExportedNames) {
        rawModule.globals.fs.i_closeSoundStream = (
            ...args: Parameters<NonNullable<FsApi>['onCloseSoundStream']>
        ) => fs.onCloseSoundStream(...args)
    }
    if ('i_writeSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_writeSoundFile = (
            ...args: Parameters<NonNullable<FsApi>['onWriteSoundFile']>
        ) => fs.onWriteSoundFile(...args)
    }
    if ('i_readSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_readSoundFile = (
            ...args: Parameters<NonNullable<FsApi>['onReadSoundFile']>
        ) => fs.onReadSoundFile(...args)
    }
    return fs
}
