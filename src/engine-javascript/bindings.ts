import { getFloatArrayType } from '../compile-helpers'
import { createModule } from '../engine-common/modules-helpers'
import { Bindings } from '../engine-common/types'
import { AudioSettings, Code, Engine, FloatArray } from '../types'

interface CommonsRawModule {
    commons_getArray: Engine['commons']['getArray']
    commons_setArray: Engine['commons']['setArray']
}

interface FsRawModule {
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

export type RawJavaScriptEngine = CommonsRawModule &
    FsRawModule & {
        metadata: Engine['metadata']
        configure: Engine['configure']
        loop: Engine['loop']
        outletListeners: Engine['outletListeners']
        inletCallers: Engine['inletCallers']
    }

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
