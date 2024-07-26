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

import { RawModuleWithNameMapping, getFloatArrayType } from '../../run/run-helpers'
import { createModule } from '../../run/run-helpers'
import { Bindings, EngineMetadata } from '../../run/types'
import { Code } from '../../ast/types'
import { Engine, FloatArray, RawModule } from '../../run/types'

export interface EngineLifecycleRawModule extends RawModule {
    metadata: Engine['metadata']
    initialize: Engine['initialize']
    dspLoop: Engine['dspLoop']
    io: Engine['io']
}

interface CommonsRawModule extends EngineLifecycleRawModule {
    commons: {
        getArray: Engine['commons']['getArray']
        setArray: Engine['commons']['setArray']
    }
}

interface FsRawModule extends EngineLifecycleRawModule {
    fs: {
        x_onReadSoundFileResponse: NonNullable<Engine['fs']>['sendReadSoundFileResponse']
        x_onWriteSoundFileResponse: NonNullable<Engine['fs']>['sendWriteSoundFileResponse']
        x_onCloseSoundStream: NonNullable<Engine['fs']>['closeSoundStream']
        x_onSoundStreamData: NonNullable<Engine['fs']>['sendSoundStreamData']
        i_openSoundWriteStream: NonNullable<Engine['fs']>['onOpenSoundWriteStream']
        i_sendSoundStreamData: NonNullable<Engine['fs']>['onSoundStreamData']
        i_openSoundReadStream: NonNullable<Engine['fs']>['onOpenSoundReadStream']
        i_closeSoundStream: NonNullable<Engine['fs']>['onCloseSoundStream']
        i_writeSoundFile: NonNullable<Engine['fs']>['onWriteSoundFile']
        i_readSoundFile: NonNullable<Engine['fs']>['onReadSoundFile']
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

export const applyNameMappingToRawModule = (rawModule: EngineLifecycleRawModule): RawJavaScriptEngine => {
    const rawModuleWithNameMapping = RawModuleWithNameMapping<RawJavaScriptEngine>(
        rawModule, 
        rawModule.metadata.compilation.variableNamesIndex.globalCode
    )
    return rawModuleWithNameMapping
}

export const createBindings = (
    rawModule: RawJavaScriptEngine
): Bindings<Engine> => {
    const exportedNames = rawModule.metadata!.compilation.variableNamesIndex.globalCode
    const optionalBindings: Partial<Bindings<Engine>> = {}
    if ('fs' in exportedNames) {
        optionalBindings.fs = { type: 'proxy', value: createFsModule(rawModule) }
    }

    return {
        ...optionalBindings,
        metadata: { type: 'raw' },
        initialize: { type: 'raw' },
        dspLoop: { type: 'raw' },
        io: { type: 'raw' },
        commons: {
            type: 'proxy',
            value: createCommonsModule(
                rawModule,
                rawModule.metadata
            ),
        },
    }
}

export const createEngine = (code: Code): Engine => {
    const rawModule = applyNameMappingToRawModule(compileRawModule(code))
    return createModule(rawModule, createBindings(rawModule))
}

const createFsModule = (rawModule: FsRawModule): Engine['fs'] => {
    const fsExportedNames = rawModule.metadata.compilation.variableNamesIndex.globalCode.fs!
    const fs = createModule<NonNullable<Engine['fs']>>(rawModule, {
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
                    ? rawModule.fs.x_onReadSoundFileResponse
                    : undefined,
        },
        sendWriteSoundFileResponse: {
            type: 'proxy',
            value:
                'x_onWriteSoundFileResponse' in fsExportedNames
                    ? rawModule.fs.x_onWriteSoundFileResponse
                    : undefined,
        },
        //should register the operation success { bitDepth: 32, target: 'javascript' }
        sendSoundStreamData: {
            type: 'proxy',
            value:
                'x_onSoundStreamData' in fsExportedNames
                    ? rawModule.fs.x_onSoundStreamData
                    : undefined,
        },
        closeSoundStream: {
            type: 'proxy',
            value:
                'x_onCloseSoundStream' in fsExportedNames
                    ? rawModule.fs.x_onCloseSoundStream
                    : undefined,
        },
    })

    if ('i_openSoundWriteStream' in fsExportedNames) {
        rawModule.fs.i_openSoundWriteStream = (
            ...args: Parameters<NonNullable<Engine['fs']>['onOpenSoundWriteStream']>
        ) => fs.onOpenSoundWriteStream(...args)
    }
    if ('i_sendSoundStreamData' in fsExportedNames) {
        rawModule.fs.i_sendSoundStreamData = (
            ...args: Parameters<NonNullable<Engine['fs']>['onSoundStreamData']>
        ) => fs.onSoundStreamData(...args)
    }
    if ('i_openSoundReadStream' in fsExportedNames) {
        rawModule.fs.i_openSoundReadStream = (
            ...args: Parameters<NonNullable<Engine['fs']>['onOpenSoundReadStream']>
        ) => fs.onOpenSoundReadStream(...args)
    }
    if ('i_closeSoundStream' in fsExportedNames) {
        rawModule.fs.i_closeSoundStream = (
            ...args: Parameters<NonNullable<Engine['fs']>['onCloseSoundStream']>
        ) => fs.onCloseSoundStream(...args)
    }
    if ('i_writeSoundFile' in fsExportedNames) {
        rawModule.fs.i_writeSoundFile = (
            ...args: Parameters<NonNullable<Engine['fs']>['onWriteSoundFile']>
        ) => fs.onWriteSoundFile(...args)
    }
    if ('i_readSoundFile' in fsExportedNames) {
        rawModule.fs.i_readSoundFile = (
            ...args: Parameters<NonNullable<Engine['fs']>['onReadSoundFile']>
        ) => fs.onReadSoundFile(...args)
    }
    return fs
}

const createCommonsModule = (
    rawModule: CommonsRawModule,
    metadata: EngineMetadata,
): Engine['commons'] => {
    const floatArrayType = getFloatArrayType(metadata.audioSettings.bitDepth)
    return createModule<Engine['commons']>(rawModule, {
        getArray: { type: 'proxy', value: (arrayName) => rawModule.commons.getArray(arrayName) },
        setArray: {
            type: 'proxy',
            value: (arrayName: string, array: FloatArray | Array<number>) =>
                rawModule.commons.setArray(
                    arrayName,
                    new floatArrayType(array)
                ),
        },
    })
}
