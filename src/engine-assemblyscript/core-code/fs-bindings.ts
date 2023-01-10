import { InternalPointer, MessagePointer, StringPointer } from '../types'
import { tarray_WasmExports } from './tarray-bindings'

export interface fs_WasmExports extends tarray_WasmExports {
    fs_onReadSoundFileResponse: (
        id: number,
        status: number,
        sound: InternalPointer
    ) => void
    fs_onWriteSoundFileResponse: (id: number, status: number) => void
    fs_onSoundStreamData: (id: number, block: InternalPointer) => number
    fs_onCloseSoundStream: (id: number, status: number) => void
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
