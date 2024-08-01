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

import {
    applyVariableNamesIndexNameMapping,
    getFloatArrayType,
} from '../../run/run-helpers'
import { attachBindings } from '../../run/run-helpers'
import { Bindings, EngineMetadata } from '../../run/types'
import { Code } from '../../ast/types'
import { Engine, FloatArray } from '../../run/types'

type EngineFs = NonNullable<Engine['globals']['fs']>

export interface EngineLifecycleRawModule {
    metadata: Engine['metadata']
    initialize: Engine['initialize']
    dspLoop: Engine['dspLoop']
    io: Engine['io']
}

interface CommonsRawModule extends EngineLifecycleRawModule {
    globals: {
        commons: {
            getArray: Engine['globals']['commons']['getArray']
            setArray: Engine['globals']['commons']['setArray']
        }
    }
}

interface FsRawModule extends EngineLifecycleRawModule {
    globals: {
        fs: {
            x_onReadSoundFileResponse: EngineFs['sendReadSoundFileResponse']
            x_onWriteSoundFileResponse: EngineFs['sendWriteSoundFileResponse']
            x_onCloseSoundStream: EngineFs['closeSoundStream']
            x_onSoundStreamData: EngineFs['sendSoundStreamData']
            i_openSoundWriteStream: EngineFs['onOpenSoundWriteStream']
            i_sendSoundStreamData: EngineFs['onSoundStreamData']
            i_openSoundReadStream: EngineFs['onOpenSoundReadStream']
            i_closeSoundStream: EngineFs['onCloseSoundStream']
            i_writeSoundFile: EngineFs['onWriteSoundFile']
            i_readSoundFile: EngineFs['onReadSoundFile']
        }
    }
}

export type RawJavaScriptEngine = CommonsRawModule &
    FsRawModule &
    EngineLifecycleRawModule

export const compileRawModule = (code: Code): EngineLifecycleRawModule =>
    new Function(`
        ${code}
        return exports
    `)()

export const createEngineBindings = (
    rawModule: RawJavaScriptEngine
): Bindings<Engine> => {
    const exportedNames =
        rawModule.metadata!.compilation.variableNamesIndex.globals
    const globalsBindings: Bindings<Engine['globals']> = {
        commons: {
            type: 'proxy',
            value: createCommonsModule(rawModule, rawModule.metadata),
        },
    }

    if ('fs' in exportedNames) {
        globalsBindings.fs = { type: 'proxy', value: createFsModule(rawModule) }
    }

    return {
        metadata: { type: 'raw' },
        initialize: { type: 'raw' },
        dspLoop: { type: 'raw' },
        io: { type: 'raw' },
        globals: {
            type: 'proxy',
            value: attachBindings(rawModule, globalsBindings),
        },
    }
}

export const createEngine = (code: Code): Engine => {
    const rawModule = compileRawModule(code)
    const rawModuleWithNameMapping = applyVariableNamesIndexNameMapping(
        rawModule,
        rawModule.metadata.compilation.variableNamesIndex
    )
    return attachBindings(
        rawModule,
        createEngineBindings(rawModuleWithNameMapping)
    )
}

const createFsModule = (rawModule: FsRawModule): Engine['globals']['fs'] => {
    const fsExportedNames =
        rawModule.metadata.compilation.variableNamesIndex.globals.fs!
    const fs = attachBindings<NonNullable<Engine['globals']['fs']>>(rawModule, {
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
        //should register the operation success { bitDepth: 32, target: 'javascript' }
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
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onOpenSoundWriteStream']
            >
        ) => fs.onOpenSoundWriteStream(...args)
    }
    if ('i_sendSoundStreamData' in fsExportedNames) {
        rawModule.globals.fs.i_sendSoundStreamData = (
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onSoundStreamData']
            >
        ) => fs.onSoundStreamData(...args)
    }
    if ('i_openSoundReadStream' in fsExportedNames) {
        rawModule.globals.fs.i_openSoundReadStream = (
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onOpenSoundReadStream']
            >
        ) => fs.onOpenSoundReadStream(...args)
    }
    if ('i_closeSoundStream' in fsExportedNames) {
        rawModule.globals.fs.i_closeSoundStream = (
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onCloseSoundStream']
            >
        ) => fs.onCloseSoundStream(...args)
    }
    if ('i_writeSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_writeSoundFile = (
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onWriteSoundFile']
            >
        ) => fs.onWriteSoundFile(...args)
    }
    if ('i_readSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_readSoundFile = (
            ...args: Parameters<
                NonNullable<Engine['globals']['fs']>['onReadSoundFile']
            >
        ) => fs.onReadSoundFile(...args)
    }
    return fs
}

const createCommonsModule = (
    rawModule: CommonsRawModule,
    metadata: EngineMetadata
): Engine['globals']['commons'] => {
    const floatArrayType = getFloatArrayType(metadata.audioSettings.bitDepth)
    return attachBindings<Engine['globals']['commons']>(rawModule, {
        getArray: {
            type: 'proxy',
            value: (arrayName) => rawModule.globals.commons.getArray(arrayName),
        },
        setArray: {
            type: 'proxy',
            value: (arrayName: string, array: FloatArray | Array<number>) =>
                rawModule.globals.commons.setArray(
                    arrayName,
                    new floatArrayType(array)
                ),
        },
    })
}
