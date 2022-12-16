import { InternalPointer, StringPointer } from '../types'
import { tarray_WasmExports } from './tarray-bindings'

export interface fs_WasmExports extends tarray_WasmExports {}

export interface fs_WasmImports {
    fs_requestReadSoundFile: (operationId: number, url: StringPointer, info: any) => void
    fs_requestWriteSoundFile: (
        operationId: number,
        url: StringPointer,
        listOfArrays: InternalPointer,
        info: any
    ) => void
    fs_requestReadSoundStream: (operationId: number, url: StringPointer, info: any) => void
    fs_requestCloseSoundStream: (operationId: number) => void
}
