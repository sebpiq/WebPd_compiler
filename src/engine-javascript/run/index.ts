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

/**
 * These bindings enable easier interaction with Wasm modules generated with our AssemblyScript compilation.
 * For example : instantiation, passing data back and forth, etc ...
 *
 * **Warning** : These bindings are compiled with rollup as a standalone JS module for inclusion in other libraries.
 * In consequence, they are meant to be kept lightweight, and should avoid importing dependencies.
 *
 * @module
 */

import { getFloatArrayType } from '../../compile/compile-helpers'
import { createModule } from '../../run/modules-helpers'
import { Bindings } from '../../run/types'
import { AudioSettings, Code } from '../../compile/types'
import { Engine, FloatArray, RawModule } from '../../run/types'

interface CommonsRawModule extends RawModule {
    commons_getArray: Engine['commons']['getArray']
    commons_setArray: Engine['commons']['setArray']
}

interface FsRawModule extends RawModule {
    x_fs_onReadSoundFileResponse: Engine['fs']['sendReadSoundFileResponse']
    x_fs_onWriteSoundFileResponse: Engine['fs']['sendWriteSoundFileResponse']
    x_fs_onCloseSoundStream: Engine['fs']['closeSoundStream']
    x_fs_onSoundStreamData: Engine['fs']['sendSoundStreamData']
    i_fs_openSoundWriteStream: Engine['fs']['onOpenSoundWriteStream']
    i_fs_sendSoundStreamData: Engine['fs']['onSoundStreamData']
    i_fs_openSoundReadStream: Engine['fs']['onOpenSoundReadStream']
    i_fs_closeSoundStream: Engine['fs']['onCloseSoundStream']
    i_fs_writeSoundFile: Engine['fs']['onWriteSoundFile']
    i_fs_readSoundFile: Engine['fs']['onReadSoundFile']
}

interface EngineLifecycleRawModule extends RawModule {
    metadata: Engine['metadata']
    configure: Engine['configure']
    loop: Engine['loop']
    outletListeners: Engine['outletListeners']
    inletCallers: Engine['inletCallers']
}

export type RawJavaScriptEngine = CommonsRawModule &
    FsRawModule &
    EngineLifecycleRawModule

export const createRawModule = (code: Code): RawJavaScriptEngine =>
    new Function(`
        ${code}
        return exports
    `)()

export const createBindings = (
    rawModule: RawJavaScriptEngine
): Bindings<Engine> => ({
    fs: { type: 'proxy', value: createFsModule(rawModule) },
    metadata: { type: 'raw' },
    configure: { type: 'raw' },
    loop: { type: 'raw' },
    inletCallers: { type: 'raw' },
    outletListeners: { type: 'raw' },
    commons: {
        type: 'proxy',
        value: createCommonsModule(
            rawModule,
            rawModule.metadata.audioSettings.bitDepth
        ),
    },
})

export const createEngine = (code: Code) => {
    const rawModule = createRawModule(code)
    return createModule(rawModule, createBindings(rawModule))
}

const createFsModule = (rawModule: FsRawModule): Engine['fs'] => {
    const fs = createModule<Engine['fs']>(rawModule, {
        onReadSoundFile: { type: 'callback', value: () => undefined },
        onWriteSoundFile: { type: 'callback', value: () => undefined },
        onOpenSoundReadStream: { type: 'callback', value: () => undefined },
        onOpenSoundWriteStream: { type: 'callback', value: () => undefined },
        onSoundStreamData: { type: 'callback', value: () => undefined },
        onCloseSoundStream: { type: 'callback', value: () => undefined },
        sendReadSoundFileResponse: {
            type: 'proxy',
            value: rawModule.x_fs_onReadSoundFileResponse,
        },
        sendWriteSoundFileResponse: {
            type: 'proxy',
            value: rawModule.x_fs_onWriteSoundFileResponse,
        },
        sendSoundStreamData: {
            type: 'proxy',
            value: rawModule.x_fs_onSoundStreamData,
        },
        closeSoundStream: {
            type: 'proxy',
            value: rawModule.x_fs_onCloseSoundStream,
        },
    })

    rawModule.i_fs_openSoundWriteStream = (
        ...args: Parameters<Engine['fs']['onOpenSoundWriteStream']>
    ) => fs.onOpenSoundWriteStream(...args)
    rawModule.i_fs_sendSoundStreamData = (
        ...args: Parameters<Engine['fs']['onSoundStreamData']>
    ) => fs.onSoundStreamData(...args)
    rawModule.i_fs_openSoundReadStream = (
        ...args: Parameters<Engine['fs']['onOpenSoundReadStream']>
    ) => fs.onOpenSoundReadStream(...args)
    rawModule.i_fs_closeSoundStream = (
        ...args: Parameters<Engine['fs']['onCloseSoundStream']>
    ) => fs.onCloseSoundStream(...args)
    rawModule.i_fs_writeSoundFile = (
        ...args: Parameters<Engine['fs']['onWriteSoundFile']>
    ) => fs.onWriteSoundFile(...args)
    rawModule.i_fs_readSoundFile = (
        ...args: Parameters<Engine['fs']['onReadSoundFile']>
    ) => fs.onReadSoundFile(...args)
    return fs
}

const createCommonsModule = (
    rawModule: CommonsRawModule,
    bitDepth: AudioSettings['bitDepth']
): Engine['commons'] => {
    const floatArrayType = getFloatArrayType(bitDepth)
    return createModule<Engine['commons']>(rawModule, {
        getArray: { type: 'proxy', value: rawModule.commons_getArray },
        setArray: {
            type: 'proxy',
            value: (arrayName: string, array: FloatArray | Array<number>) =>
                rawModule.commons_setArray(
                    arrayName,
                    new floatArrayType(array)
                ),
        },
    })
}
