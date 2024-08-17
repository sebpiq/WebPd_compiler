import { EngineLifecycleRawModule } from "../../engine-javascript/run"
import { attachBindings } from "../../run/run-helpers"
import { FsApi, FsExportsJavaScript, FsImportsJavaScript } from "./types"

export interface FsRawModule extends EngineLifecycleRawModule {
    globals: {
        fs: FsExportsJavaScript & FsImportsJavaScript
    }
}

export const createFsModule = (rawModule: FsRawModule): FsApi => {
    const fsExportedNames =
        rawModule.metadata.compilation.variableNamesIndex.globals.fs!
    const fs = attachBindings<NonNullable<FsApi>>(rawModule, {
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
            ...args: Parameters<
                NonNullable<FsApi>['onOpenSoundWriteStream']
            >
        ) => fs.onOpenSoundWriteStream(...args)
    }
    if ('i_sendSoundStreamData' in fsExportedNames) {
        rawModule.globals.fs.i_sendSoundStreamData = (
            ...args: Parameters<
                NonNullable<FsApi>['onSoundStreamData']
            >
        ) => fs.onSoundStreamData(...args)
    }
    if ('i_openSoundReadStream' in fsExportedNames) {
        rawModule.globals.fs.i_openSoundReadStream = (
            ...args: Parameters<
                NonNullable<FsApi>['onOpenSoundReadStream']
            >
        ) => fs.onOpenSoundReadStream(...args)
    }
    if ('i_closeSoundStream' in fsExportedNames) {
        rawModule.globals.fs.i_closeSoundStream = (
            ...args: Parameters<
                NonNullable<FsApi>['onCloseSoundStream']
            >
        ) => fs.onCloseSoundStream(...args)
    }
    if ('i_writeSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_writeSoundFile = (
            ...args: Parameters<
                NonNullable<FsApi>['onWriteSoundFile']
            >
        ) => fs.onWriteSoundFile(...args)
    }
    if ('i_readSoundFile' in fsExportedNames) {
        rawModule.globals.fs.i_readSoundFile = (
            ...args: Parameters<
                NonNullable<FsApi>['onReadSoundFile']
            >
        ) => fs.onReadSoundFile(...args)
    }
    return fs
}