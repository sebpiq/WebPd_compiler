import { InternalPointer, StringPointer } from '../types'
import { tarray_WasmExports } from './tarray-bindings'

export interface fs_WasmExports extends tarray_WasmExports {}

export interface fs_WasmImports {
    fs_readSoundListener: (url: StringPointer, info: any) => void
    fs_writeSoundListener: (
        url: StringPointer,
        listOfArrays: InternalPointer,
        info: any
    ) => void
}
