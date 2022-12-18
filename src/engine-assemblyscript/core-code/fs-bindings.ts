import { InternalPointer, StringPointer } from '../types'
import { tarray_WasmExports } from './tarray-bindings'

export interface fs_WasmExports extends tarray_WasmExports {
    fs_requestReadSoundFile: (
        id: number,
        url: StringPointer,
        info: InternalPointer
    ) => void
    fs_requestReadSoundStream: (
        id: number,
        url: StringPointer,
        info: InternalPointer
    ) => void
    fs_requestWriteSoundFile: (
        id: number,
        url: StringPointer,
        sound: InternalPointer,
        info: InternalPointer
    ) => void
    fs_requestCloseSoundStream: (id: number) => void
    fs_readSoundFileResponse: (id: number, sound: InternalPointer) => void
    fs_writeSoundFileResponse: (id: number) => void
    fs_soundStreamData: (id: number, block: InternalPointer) => number
    fs_soundStreamClose: (id: number) => void
}

export interface fs_WasmImports {
    fs_requestReadSoundFile: (
        operationId: number,
        url: StringPointer,
        info: any
    ) => void
    fs_requestWriteSoundFile: (
        operationId: number,
        url: StringPointer,
        listOfArrays: InternalPointer,
        info: any
    ) => void
    fs_requestReadSoundStream: (
        operationId: number,
        url: StringPointer,
        info: any
    ) => void
    fs_requestCloseSoundStream: (operationId: number) => void
}
