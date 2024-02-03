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

import { GlobalCodeGeneratorWithSettings } from '../compile/types'
import { bufCore, bufPushPull } from './buf'
import { msg } from './msg'
import { Sequence, Class, ConstVar, Func, Var } from '../ast/declare'
import { AstSequenceContent } from '../ast/types'

export const FS_OPERATION_SUCCESS = 0
export const FS_OPERATION_FAILURE = 1

export const fsCore: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ settings: { target } }) => {
        const content: Array<AstSequenceContent> = []
        if (target === 'assemblyscript') {
            content.push(`
                type fs_OperationId = Int
                type fs_OperationStatus = Int
                type fs_OperationCallback = (id: fs_OperationId, status: fs_OperationStatus) => void
                type fs_OperationSoundCallback = (id: fs_OperationId, status: fs_OperationStatus, sound: FloatArray[]) => void
                type fs_Url = string
            `)
        }
        // prettier-ignore
        return Sequence([
            ...content,
            ConstVar('Int', 'FS_OPERATION_SUCCESS', FS_OPERATION_SUCCESS.toString()),
            ConstVar('Int', 'FS_OPERATION_FAILURE', FS_OPERATION_FAILURE.toString()),
            
            ConstVar('Set<fs_OperationId>', '_FS_OPERATIONS_IDS', 'new Set()'),
            ConstVar('Map<fs_OperationId, fs_OperationCallback>', '_FS_OPERATIONS_CALLBACKS', 'new Map()'),
            
            ConstVar(
                'Map<fs_OperationId, fs_OperationSoundCallback>',
                '_FS_OPERATIONS_SOUND_CALLBACKS',
                'new Map()',
            ),
    
            // We start at 1, because 0 is what ASC uses when host forgets to pass an arg to 
            // a function. Therefore we can get false negatives when a test happens to expect a 0.
            Var('Int', '_FS_OPERATION_COUNTER', '1'),

            Class('fs_SoundInfo', [
                Var('Int', 'channelCount'),
                Var('Int', 'sampleRate'),
                Var('Int', 'bitDepth'),
                Var('string', 'encodingFormat'),
                Var('string', 'endianness'),
                Var('string', 'extraOptions'),
            ]),

            Func('fs_soundInfoToMessage', [
                Var('fs_SoundInfo', 'soundInfo')
            ], 'Message')`
                ${ConstVar('Message', 'info', `msg_create([
                    MSG_FLOAT_TOKEN,
                    MSG_FLOAT_TOKEN,
                    MSG_FLOAT_TOKEN,
                    MSG_STRING_TOKEN,
                    soundInfo.encodingFormat.length,
                    MSG_STRING_TOKEN,
                    soundInfo.endianness.length,
                    MSG_STRING_TOKEN,
                    soundInfo.extraOptions.length
                ])`)}
                msg_writeFloatToken(info, 0, toFloat(soundInfo.channelCount))
                msg_writeFloatToken(info, 1, toFloat(soundInfo.sampleRate))
                msg_writeFloatToken(info, 2, toFloat(soundInfo.bitDepth))
                msg_writeStringToken(info, 3, soundInfo.encodingFormat)
                msg_writeStringToken(info, 4, soundInfo.endianness)
                msg_writeStringToken(info, 5, soundInfo.extraOptions)
                return info
            `,
    
            Func('_fs_assertOperationExists', [
                Var('fs_OperationId', 'id'), 
                Var('string', 'operationName'),
            ], 'void')`
                if (!_FS_OPERATIONS_IDS.has(id)) {
                    throw new Error(operationName + ' operation unknown : ' + id.toString())
                }
            `,
    
            Func('_fs_createOperationId', [], 'fs_OperationId')`
                ${ConstVar('fs_OperationId', 'id', '_FS_OPERATION_COUNTER++')}
                _FS_OPERATIONS_IDS.add(id)
                return id
            `
        ])
    },

    dependencies: [msg],
}

export const fsReadSoundFile: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: () => Sequence([
        Func('fs_readSoundFile', [
            Var('fs_Url', 'url'),
            Var('fs_SoundInfo', 'soundInfo'),
            Var('fs_OperationSoundCallback', 'callback'),
        ], 'fs_OperationId')`
            ${ConstVar('fs_OperationId', 'id', '_fs_createOperationId()')}
            _FS_OPERATIONS_SOUND_CALLBACKS.set(id, callback)
            i_fs_readSoundFile(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        `,

        Func('x_fs_onReadSoundFileResponse', [
            Var('fs_OperationId', 'id'),
            Var('fs_OperationStatus', 'status'),
            Var('FloatArray[]', 'sound'),
        ], 'void')`
            _fs_assertOperationExists(id, 'x_fs_onReadSoundFileResponse')
            _FS_OPERATIONS_IDS.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = _FS_OPERATIONS_SOUND_CALLBACKS.get(id)
            callback(id, status, sound)
            _FS_OPERATIONS_SOUND_CALLBACKS.delete(id)
        `
    ]),

    exports: [
        {
            name: 'x_fs_onReadSoundFileResponse',
        },
    ],

    imports: [
        Func(
            'i_fs_readSoundFile',
            [
                Var('fs_OperationId', 'id'),
                Var('fs_Url', 'url'),
                Var('Message', 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsWriteSoundFile: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: () => Sequence([
        Func('fs_writeSoundFile', [
            Var('FloatArray[]', 'sound'),
            Var('fs_Url', 'url'),
            Var('fs_SoundInfo', 'soundInfo'),
            Var('fs_OperationCallback', 'callback'),
        ], 'fs_OperationId')`
            ${ConstVar('fs_OperationId', 'id', '_fs_createOperationId()')}
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_writeSoundFile(id, sound, url, fs_soundInfoToMessage(soundInfo))
            return id
        `,

        Func('x_fs_onWriteSoundFileResponse', [
            Var('fs_OperationId', 'id'), 
            Var('fs_OperationStatus', 'status'),
        ], 'void')`
            _fs_assertOperationExists(id, 'x_fs_onWriteSoundFileResponse')
            _FS_OPERATIONS_IDS.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            ${ConstVar('fs_OperationCallback', 'callback', '_FS_OPERATIONS_CALLBACKS.get(id)')}
            callback(id, status)
            _FS_OPERATIONS_CALLBACKS.delete(id)
        `
    ]),

    exports: [
        {
            name: 'x_fs_onWriteSoundFileResponse',
        },
    ],

    imports: [
        Func(
            'i_fs_writeSoundFile',
            [
                Var('fs_OperationId', 'id'),
                Var('FloatArray[]', 'sound'),
                Var('fs_Url', 'url'),
                Var('Message', 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsSoundStreamCore: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: () => Sequence([
        ConstVar(
            'Map<fs_OperationId, Array<buf_SoundBuffer>>',
            '_FS_SOUND_STREAM_BUFFERS',
            'new Map()'
        ),

        ConstVar(
            'Int',
            '_FS_SOUND_BUFFER_LENGTH', 
            '20 * 44100',
        ),

        Func('fs_closeSoundStream', [
            Var('fs_OperationId', 'id'), 
            Var('fs_OperationStatus', 'status'),
        ], 'void')`
            if (!_FS_OPERATIONS_IDS.has(id)) {
                return
            }
            _FS_OPERATIONS_IDS.delete(id)
            _FS_OPERATIONS_CALLBACKS.get(id)(id, status)
            _FS_OPERATIONS_CALLBACKS.delete(id)
            // Delete this last, to give the callback 
            // a chance to save a reference to the buffer
            // If write stream, there won't be a buffer
            if (_FS_SOUND_STREAM_BUFFERS.has(id)) {
                _FS_SOUND_STREAM_BUFFERS.delete(id)
            }
            i_fs_closeSoundStream(id, status)
        `,

        Func('x_fs_onCloseSoundStream', [
            Var('fs_OperationId', 'id'), 
            Var('fs_OperationStatus', 'status'),
        ], 'void')`
            fs_closeSoundStream(id, status)
        `
    ]),

    exports: [
        {
            name: 'x_fs_onCloseSoundStream',
        },
    ],

    imports: [
        Func(
            'i_fs_closeSoundStream',
            [Var('fs_OperationId', 'id'), Var('fs_OperationStatus', 'status')],
            'void'
        )``,
    ],

    dependencies: [bufCore, fsCore],
}

export const fsReadSoundStream: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: () => Sequence([
        Func('fs_openSoundReadStream', [
            Var('fs_Url', 'url'),
            Var('fs_SoundInfo', 'soundInfo'),
            Var('fs_OperationCallback', 'callback'),
        ], 'fs_OperationId')`
            ${ConstVar('fs_OperationId', 'id', '_fs_createOperationId()')}
            ${ConstVar('Array<buf_SoundBuffer>', 'buffers', '[]')}
            for (${Var('Int', 'channel', '0')}; channel < soundInfo.channelCount; channel++) {
                buffers.push(buf_create(_FS_SOUND_BUFFER_LENGTH))
            }
            _FS_SOUND_STREAM_BUFFERS.set(id, buffers)
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_openSoundReadStream(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        `,

        Func('x_fs_onSoundStreamData',[
            Var('fs_OperationId', 'id'),
            Var('FloatArray[]', 'block'),
        ], 'Int')`
            _fs_assertOperationExists(id, 'x_fs_onSoundStreamData')
            const buffers = _FS_SOUND_STREAM_BUFFERS.get(id)
            for (${Var('Int', 'i', '0')}; i < buffers.length; i++) {
                buf_pushBlock(buffers[i], block[i])
            }
            return buffers[0].pullAvailableLength
        `
    ]),

    exports: [
        {
            name: 'x_fs_onSoundStreamData',
        },
    ],

    imports: [
        Func(
            'i_fs_openSoundReadStream',
            [
                Var('fs_OperationId', 'id'),
                Var('fs_Url', 'url'),
                Var('Message', 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsSoundStreamCore, bufPushPull],
}

export const fsWriteSoundStream: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: () => Sequence([
        Func('fs_openSoundWriteStream', [
                Var('fs_Url', 'url'),
                Var('fs_SoundInfo', 'soundInfo'),
                Var('fs_OperationCallback', 'callback'),
            ],
            'fs_OperationId'
        )`
            const id = _fs_createOperationId()
            _FS_SOUND_STREAM_BUFFERS.set(id, [])
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_openSoundWriteStream(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        `,

        Func('fs_sendSoundStreamData', [
            Var('fs_OperationId', 'id'), 
            Var('FloatArray[]', 'block')
        ], 'void')`
            _fs_assertOperationExists(id, 'fs_sendSoundStreamData')
            i_fs_sendSoundStreamData(id, block)
        `
    ]),

    imports: [
        Func(
            'i_fs_openSoundWriteStream',
            [
                Var('fs_OperationId', 'id'),
                Var('fs_Url', 'url'),
                Var('Message', 'info'),
            ],
            'void'
        )``,
        Func(
            'i_fs_sendSoundStreamData',
            [Var('fs_OperationId', 'id'), Var('FloatArray[]', 'block')],
            'void'
        )``,
    ],

    dependencies: [fsSoundStreamCore],
}
