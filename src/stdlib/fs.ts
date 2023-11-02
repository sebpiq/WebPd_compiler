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

import { renderIf } from '../functional-helpers'
import {
    GlobalCodeGeneratorWithSettings,
    GlobalCodeGenerator,
} from '../compile/types'
import { bufCore, bufPushPull } from './buf'
import { msg } from './msg'

export const FS_OPERATION_SUCCESS = 0
export const FS_OPERATION_FAILURE = 1

export const fsCore: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func }, target }) => `
        ${renderIf(
            target === 'assemblyscript',
            `
                type fs_OperationId = Int
                type fs_OperationStatus = Int
                type fs_OperationCallback = (id: fs_OperationId, status: fs_OperationStatus) => void
                type fs_OperationSoundCallback = (id: fs_OperationId, status: fs_OperationStatus, sound: FloatArray[]) => void
                type fs_Url = string
            `
        )}

        const ${Var('FS_OPERATION_SUCCESS', 'Int')} = ${FS_OPERATION_SUCCESS}
        const ${Var('FS_OPERATION_FAILURE', 'Int')} = ${FS_OPERATION_FAILURE}
        
        const ${Var('_FS_OPERATIONS_IDS', 'Set<fs_OperationId>')} = new Set()
        const ${Var(
            '_FS_OPERATIONS_CALLBACKS',
            'Map<fs_OperationId, fs_OperationCallback>'
        )} = new Map()
        const ${Var(
            '_FS_OPERATIONS_SOUND_CALLBACKS',
            'Map<fs_OperationId, fs_OperationSoundCallback>'
        )} = new Map()

        // We start at 1, because 0 is what ASC uses when host forgets to pass an arg to 
        // a function. Therefore we can get false negatives when a test happens to expect a 0.
        let ${Var('_FS_OPERATION_COUNTER', 'Int')} = 1

        class fs_SoundInfo {
            ${Var('channelCount', 'Int')}
            ${Var('sampleRate', 'Int')}
            ${Var('bitDepth', 'Int')}
            ${Var('encodingFormat', 'string')}
            ${Var('endianness', 'string')}
            ${Var('extraOptions', 'string')}
        }

        function fs_soundInfoToMessage ${Func(
            [Var('soundInfo', 'fs_SoundInfo')],
            'Message'
        )} {
            const ${Var('info', 'Message')} = msg_create([
                MSG_FLOAT_TOKEN,
                MSG_FLOAT_TOKEN,
                MSG_FLOAT_TOKEN,
                MSG_STRING_TOKEN,
                soundInfo.encodingFormat.length,
                MSG_STRING_TOKEN,
                soundInfo.endianness.length,
                MSG_STRING_TOKEN,
                soundInfo.extraOptions.length
            ])
            msg_writeFloatToken(info, 0, toFloat(soundInfo.channelCount))
            msg_writeFloatToken(info, 1, toFloat(soundInfo.sampleRate))
            msg_writeFloatToken(info, 2, toFloat(soundInfo.bitDepth))
            msg_writeStringToken(info, 3, soundInfo.encodingFormat)
            msg_writeStringToken(info, 4, soundInfo.endianness)
            msg_writeStringToken(info, 5, soundInfo.extraOptions)
            return info
        }

        function _fs_assertOperationExists ${Func(
            [Var('id', 'fs_OperationId'), Var('operationName', 'string')],
            'void'
        )} {
            if (!_FS_OPERATIONS_IDS.has(id)) {
                throw new Error(operationName + ' operation unknown : ' + id.toString())
            }
        }

        function _fs_createOperationId ${Func([], 'fs_OperationId')} {
            const ${Var('id', 'fs_OperationId')} = _FS_OPERATION_COUNTER++
            _FS_OPERATIONS_IDS.add(id)
            return id
        }   
    `,

    dependencies: [msg],
}

export const fsReadSoundFile: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Func, Var } }) => `
        function fs_readSoundFile ${Func(
            [
                Var('url', 'fs_Url'),
                Var('soundInfo', 'fs_SoundInfo'),
                Var('callback', 'fs_OperationSoundCallback'),
            ],
            'fs_OperationId'
        )} {
            const ${Var('id', 'fs_OperationId')} = _fs_createOperationId()
            _FS_OPERATIONS_SOUND_CALLBACKS.set(id, callback)
            i_fs_readSoundFile(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        }

        function x_fs_onReadSoundFileResponse ${Func(
            [
                Var('id', 'fs_OperationId'),
                Var('status', 'fs_OperationStatus'),
                Var('sound', 'FloatArray[]'),
            ],
            'void'
        )} {
            _fs_assertOperationExists(id, 'x_fs_onReadSoundFileResponse')
            _FS_OPERATIONS_IDS.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = _FS_OPERATIONS_SOUND_CALLBACKS.get(id)
            callback(id, status, sound)
            _FS_OPERATIONS_SOUND_CALLBACKS.delete(id)
        }
    `,

    exports: [
        {
            name: 'x_fs_onReadSoundFileResponse',
        },
    ],

    imports: [
        {
            name: 'i_fs_readSoundFile',
            args: [
                ['id', 'fs_OperationId'],
                ['url', 'fs_Url'],
                ['info', 'Message'],
            ],
            returns: 'void',
        },
    ],

    dependencies: [fsCore],
}

export const fsWriteSoundFile: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Func, Var } }) => `
        function fs_writeSoundFile ${Func(
            [
                Var('sound', 'FloatArray[]'),
                Var('url', 'fs_Url'),
                Var('soundInfo', 'fs_SoundInfo'),
                Var('callback', 'fs_OperationCallback'),
            ],
            'fs_OperationId'
        )} {
            const id = _fs_createOperationId()
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_writeSoundFile(id, sound, url, fs_soundInfoToMessage(soundInfo))
            return id
        }

        function x_fs_onWriteSoundFileResponse ${Func(
            [Var('id', 'fs_OperationId'), Var('status', 'fs_OperationStatus')],
            'void'
        )} {
            _fs_assertOperationExists(id, 'x_fs_onWriteSoundFileResponse')
            _FS_OPERATIONS_IDS.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = _FS_OPERATIONS_CALLBACKS.get(id)
            callback(id, status)
            _FS_OPERATIONS_CALLBACKS.delete(id)
        }
    `,

    exports: [
        {
            name: 'x_fs_onWriteSoundFileResponse',
        },
    ],

    imports: [
        {
            name: 'i_fs_writeSoundFile',
            args: [
                ['id', 'fs_OperationId'],
                ['sound', 'FloatArray[]'],
                ['url', 'fs_Url'],
                ['info', 'Message'],
            ],
            returns: 'void',
        },
    ],

    dependencies: [fsCore],
}

export const fsSoundStreamCore: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Func, Var } }) => `
        const ${Var(
            '_FS_SOUND_STREAM_BUFFERS',
            'Map<fs_OperationId, Array<buf_SoundBuffer>>'
        )} = new Map()

        const ${Var('_FS_SOUND_BUFFER_LENGTH', 'Int')} = 20 * 44100

        function fs_closeSoundStream ${Func(
            [Var('id', 'fs_OperationId'), Var('status', 'fs_OperationStatus')],
            'void'
        )} {
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
        }

        function x_fs_onCloseSoundStream ${Func(
            [Var('id', 'fs_OperationId'), Var('status', 'fs_OperationStatus')],
            'void'
        )} {
            fs_closeSoundStream(id, status)
        }
    `,

    exports: [
        {
            name: 'x_fs_onCloseSoundStream',
        },
    ],

    imports: [
        {
            name: 'i_fs_closeSoundStream',
            args: [
                ['id', 'fs_OperationId'],
                ['status', 'fs_OperationStatus'],
            ],
            returns: 'void',
        },
    ],

    dependencies: [bufCore, fsCore],
}

export const fsReadSoundStream: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Var, Func } }) => `
        function fs_openSoundReadStream ${Func(
            [
                Var('url', 'fs_Url'),
                Var('soundInfo', 'fs_SoundInfo'),
                Var('callback', 'fs_OperationCallback'),
            ],
            'fs_OperationId'
        )} {
            const id = _fs_createOperationId()
            const ${Var('buffers', 'Array<buf_SoundBuffer>')} = []
            for (let channel = 0; channel < soundInfo.channelCount; channel++) {
                buffers.push(new buf_SoundBuffer(_FS_SOUND_BUFFER_LENGTH))
            }
            _FS_SOUND_STREAM_BUFFERS.set(id, buffers)
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_openSoundReadStream(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        }

        function x_fs_onSoundStreamData ${Func(
            [Var('id', 'fs_OperationId'), Var('block', 'FloatArray[]')],
            'Int'
        )} {
            _fs_assertOperationExists(id, 'x_fs_onSoundStreamData')
            const buffers = _FS_SOUND_STREAM_BUFFERS.get(id)
            for (let ${Var('i', 'Int')} = 0; i < buffers.length; i++) {
                buf_pushBlock(buffers[i], block[i])
            }
            return buffers[0].pullAvailableLength
        }
    `,

    exports: [
        {
            name: 'x_fs_onSoundStreamData',
        },
    ],

    imports: [
        {
            name: 'i_fs_openSoundReadStream',
            args: [
                ['id', 'fs_OperationId'],
                ['url', 'fs_Url'],
                ['info', 'Message'],
            ],
            returns: 'void',
        },
    ],

    dependencies: [fsSoundStreamCore, bufPushPull],
}

export const fsWriteSoundStream: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ macros: { Func, Var } }) => `
        function fs_openSoundWriteStream ${Func(
            [
                Var('url', 'fs_Url'),
                Var('soundInfo', 'fs_SoundInfo'),
                Var('callback', 'fs_OperationCallback'),
            ],
            'fs_OperationId'
        )} {
            const id = _fs_createOperationId()
            _FS_SOUND_STREAM_BUFFERS.set(id, [])
            _FS_OPERATIONS_CALLBACKS.set(id, callback)
            i_fs_openSoundWriteStream(id, url, fs_soundInfoToMessage(soundInfo))
            return id
        }

        function fs_sendSoundStreamData ${Func(
            [Var('id', 'fs_OperationId'), Var('block', 'FloatArray[]')],
            'void'
        )} {
            _fs_assertOperationExists(id, 'fs_sendSoundStreamData')
            i_fs_sendSoundStreamData(id, block)
        }
    `,

    imports: [
        {
            name: 'i_fs_openSoundWriteStream',
            args: [
                ['id', 'fs_OperationId'],
                ['url', 'fs_Url'],
                ['info', 'Message'],
            ],
            returns: 'void',
        },
        {
            name: 'i_fs_sendSoundStreamData',
            args: [
                ['id', 'fs_OperationId'],
                ['block', 'FloatArray[]'],
            ],
            returns: 'void',
        },
    ],

    dependencies: [fsSoundStreamCore],
}
