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
import { InternalPointer, MessagePointer, StringPointer } from '../types'
import { commons_WasmExports } from './commons-bindings'

export interface fs_WasmExports extends commons_WasmExports {
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
