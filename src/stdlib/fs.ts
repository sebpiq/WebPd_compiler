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

import { GlobalDefinitions } from '../compile/types'
import { bufCore, bufPushPull } from './buf'
import { msg } from './msg'
import { Sequence, Class, ConstVar, Func, Var } from '../ast/declare'
import { AstSequenceContent } from '../ast/types'

const NAMESPACE = 'fs'

export const FS_OPERATION_SUCCESS = 0
export const FS_OPERATION_FAILURE = 1

export const fsCore: GlobalDefinitions = {
    namespace: NAMESPACE,
    code: ({ ns: fs }, { globals, settings: { target } }) => {
        const content: Array<AstSequenceContent> = []
        if (target === 'assemblyscript') {
            content.push(`
                type ${fs.OperationId!} = Int
                type ${fs.OperationStatus!} = Int
                type ${fs.OperationCallback!} = (
                    id: ${fs.OperationId!}, 
                    status: ${fs.OperationStatus!}
                ) => void
                type ${fs.OperationSoundCallback!} = (
                    id: ${fs.OperationId!}, 
                    status: ${fs.OperationStatus!}, 
                    sound: FloatArray[]
                ) => void
                type ${fs.Url!} = string
            `)
        }
        // prettier-ignore
        return Sequence([
            ...content,
            ConstVar(
                'Int', 
                fs.OPERATION_SUCCESS!, 
                FS_OPERATION_SUCCESS.toString()
            ),
            ConstVar(
                'Int', 
                fs.OPERATION_FAILURE!, 
                FS_OPERATION_FAILURE.toString()
            ),
            
            ConstVar(
                `Set<${fs.OperationId!}>`, 
                fs._OPERATIONS_IDS!, 
                'new Set()'
            ),
            ConstVar(
                `Map<${fs.OperationId!}, ${fs.OperationCallback!}>`, 
                fs._OPERATIONS_CALLBACKS!, 
                'new Map()'
            ),
            
            ConstVar(
                `Map<${fs.OperationId!}, ${fs.OperationSoundCallback!}>`,
                fs._OPERATIONS_SOUND_CALLBACKS!,
                'new Map()',
            ),
    
            // We start at 1, because 0 is what ASC uses when host forgets to pass an arg to 
            // a function. Therefore we can get false negatives when a test happens to expect a 0.
            Var('Int', fs._OPERATIONS_COUNTER!, '1'),

            Class(fs.SoundInfo!, [
                Var('Int', 'channelCount'),
                Var('Int', 'sampleRate'),
                Var('Int', 'bitDepth'),
                Var('string', 'encodingFormat'),
                Var('string', 'endianness'),
                Var('string', 'extraOptions'),
            ]),

            Func(fs.soundInfoToMessage!, [
                Var(fs.SoundInfo!, 'soundInfo')
            ], globals.msg!.Message!)`
                ${ConstVar(globals.msg!.Message!, 'info', `${globals.msg!.create!}([
                    ${globals.msg!.FLOAT_TOKEN!},
                    ${globals.msg!.FLOAT_TOKEN!},
                    ${globals.msg!.FLOAT_TOKEN!},
                    ${globals.msg!.STRING_TOKEN!},
                    soundInfo.encodingFormat.length,
                    ${globals.msg!.STRING_TOKEN!},
                    soundInfo.endianness.length,
                    ${globals.msg!.STRING_TOKEN!},
                    soundInfo.extraOptions.length
                ])`)}
                ${globals.msg!.writeFloatToken!}(info, 0, toFloat(soundInfo.channelCount))
                ${globals.msg!.writeFloatToken!}(info, 1, toFloat(soundInfo.sampleRate))
                ${globals.msg!.writeFloatToken!}(info, 2, toFloat(soundInfo.bitDepth))
                ${globals.msg!.writeStringToken!}(info, 3, soundInfo.encodingFormat)
                ${globals.msg!.writeStringToken!}(info, 4, soundInfo.endianness)
                ${globals.msg!.writeStringToken!}(info, 5, soundInfo.extraOptions)
                return info
            `,
    
            Func(fs._assertOperationExists!, [
                Var(fs.OperationId!, 'id'), 
                Var('string', 'operationName'),
            ], 'void')`
                if (!${fs._OPERATIONS_IDS!}.has(id)) {
                    throw new Error(operationName + ' operation unknown : ' + id.toString())
                }
            `,
    
            Func(fs._createOperationId!, [], fs.OperationId!)`
                ${ConstVar(
                    fs.OperationId!, 
                    'id', 
                    `${fs._OPERATIONS_COUNTER!}++`
                )}
                ${fs._OPERATIONS_IDS!}.add(id)
                return id
            `
        ])
    },

    dependencies: [msg],
}

export const fsReadSoundFile: GlobalDefinitions = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.readSoundFile!, [
            Var(fs.Url!, 'url'),
            Var(fs.SoundInfo!, 'soundInfo'),
            Var(fs.OperationSoundCallback!, 'callback'),
        ], fs.OperationId!)`
            ${ConstVar(
                fs.OperationId!, 
                'id', 
                `${fs._createOperationId!}()`
            )}
            ${fs._OPERATIONS_SOUND_CALLBACKS!}.set(id, callback)
            ${fs.i_readSoundFile!}(id, url, ${fs.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onReadSoundFileResponse!, [
            Var(fs.OperationId!, 'id'),
            Var(fs.OperationStatus!, 'status'),
            Var('FloatArray[]', 'sound'),
        ], 'void')`
            ${fs._assertOperationExists!}(id, "${fs.x_onReadSoundFileResponse!}")
            ${fs._OPERATIONS_IDS!}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = ${fs._OPERATIONS_SOUND_CALLBACKS!}.get(id)
            callback(id, status, sound)
            ${fs._OPERATIONS_SOUND_CALLBACKS!}.delete(id)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onReadSoundFileResponse!],

    imports: ({ ns: fs }, { globals }) => [
        Func(
            fs.i_readSoundFile!,
            [
                Var(fs.OperationId!, 'id'),
                Var(fs.Url!, 'url'),
                Var(globals.msg!.Message!, 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsWriteSoundFile: GlobalDefinitions = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.writeSoundFile!, [
            Var('FloatArray[]', 'sound'),
            Var(fs.Url!, 'url'),
            Var(fs.SoundInfo!, 'soundInfo'),
            Var(fs.OperationCallback!, 'callback'),
        ], fs.OperationId!)`
            ${ConstVar(
                fs.OperationId!, 
                'id', 
                `${fs._createOperationId!}()`
            )}
            ${fs._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${fs.i_writeSoundFile!}(id, sound, url, ${fs.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onWriteSoundFileResponse!, [
            Var(fs.OperationId!, 'id'), 
            Var(fs.OperationStatus!, 'status'),
        ], 'void')`
            ${fs._assertOperationExists!}(id, "${fs.x_onWriteSoundFileResponse!}")
            ${fs._OPERATIONS_IDS!}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            ${ConstVar(fs.OperationCallback!, 'callback', `${fs._OPERATIONS_CALLBACKS!}.get(id)`)}
            callback(id, status)
            ${fs._OPERATIONS_CALLBACKS!}.delete(id)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onWriteSoundFileResponse!],

    imports: ({ ns: fs }, { globals }) => [
        Func(
            fs.i_writeSoundFile!,
            [
                Var(fs.OperationId!, 'id'),
                Var('FloatArray[]', 'sound'),
                Var(fs.Url!, 'url'),
                Var(globals.msg!.Message!, 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsSoundStreamCore: GlobalDefinitions = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }, { globals }) => Sequence([
        ConstVar(
            `Map<${fs.OperationId!}, Array<${globals.buf!.SoundBuffer!}>>`,
            fs._SOUND_STREAM_BUFFERS!,
            'new Map()'
        ),

        ConstVar(
            'Int',
            fs._SOUND_BUFFER_LENGTH!, 
            '20 * 44100',
        ),

        Func(fs.closeSoundStream!, [
            Var(fs.OperationId!, 'id'), 
            Var(fs.OperationStatus!, 'status'),
        ], 'void')`
            if (!${fs._OPERATIONS_IDS!}.has(id)) {
                return
            }
            ${fs._OPERATIONS_IDS!}.delete(id)
            ${fs._OPERATIONS_CALLBACKS!}.get(id)(id, status)
            ${fs._OPERATIONS_CALLBACKS!}.delete(id)
            // Delete this last, to give the callback 
            // a chance to save a reference to the buffer
            // If write stream, there won't be a buffer
            if (${fs._SOUND_STREAM_BUFFERS!}.has(id)) {
                ${fs._SOUND_STREAM_BUFFERS!}.delete(id)
            }
            ${fs.i_closeSoundStream!}(id, status)
        `,

        // =========================== EXPORTED API
        Func(fs.x_onCloseSoundStream!, [
            Var(fs.OperationId!, 'id'), 
            Var(fs.OperationStatus!, 'status'),
        ], 'void')`
            ${fs.closeSoundStream!}(id, status)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onCloseSoundStream!],

    // prettier-ignore
    imports: ({ ns: fs }) => [
        Func(fs.i_closeSoundStream!, [
            Var(fs.OperationId!, 'id'), 
            Var(fs.OperationStatus!, 'status')
        ], 'void')``,
    ],

    dependencies: [bufCore, fsCore],
}

export const fsReadSoundStream: GlobalDefinitions = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }, { globals }) => Sequence([
        Func(fs.openSoundReadStream!, [
            Var(fs.Url!, 'url'),
            Var(fs.SoundInfo!, 'soundInfo'),
            Var(fs.OperationCallback!, 'callback'),
        ], fs.OperationId!)`
            ${ConstVar(
                fs.OperationId!, 
                'id', 
                `${fs._createOperationId!}()`
            )}
            ${ConstVar(
                `Array<${globals.buf!.SoundBuffer!}>`, 
                'buffers', 
                '[]'
            )}
            for (${Var('Int', 'channel', '0')}; channel < soundInfo.channelCount; channel++) {
                buffers.push(${globals.buf!.create!}(${fs._SOUND_BUFFER_LENGTH!}))
            }
            ${fs._SOUND_STREAM_BUFFERS!}.set(id, buffers)
            ${fs._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${fs.i_openSoundReadStream!}(id, url, ${fs.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onSoundStreamData!, [
            Var(fs.OperationId!, 'id'),
            Var('FloatArray[]', 'block'),
        ], 'Int')`
            ${fs._assertOperationExists!}(id, "${fs.x_onSoundStreamData!}")
            const buffers = ${fs._SOUND_STREAM_BUFFERS!}.get(id)
            for (${Var('Int', 'i', '0')}; i < buffers.length; i++) {
                ${globals.buf!.pushBlock!}(buffers[i], block[i])
            }
            return buffers[0].pullAvailableLength
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onSoundStreamData!],

    // prettier-ignore
    imports: ({ ns: fs }, { globals }) => [
        Func(fs.i_openSoundReadStream!, [
            Var(fs.OperationId!, 'id'),
            Var(fs.Url!, 'url'),
            Var(globals.msg!.Message!, 'info'),
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore, bufPushPull],
}

export const fsWriteSoundStream: GlobalDefinitions = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.openSoundWriteStream!, [
                Var(fs.Url!, 'url'),
                Var(fs.SoundInfo!, 'soundInfo'),
                Var(fs.OperationCallback!, 'callback'),
            ],
            fs.OperationId!
        )`
            const id = ${fs._createOperationId!}()
            ${fs._SOUND_STREAM_BUFFERS!}.set(id, [])
            ${fs._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${fs.i_openSoundWriteStream!}(id, url, ${fs.soundInfoToMessage!}(soundInfo))
            return id
        `,

        Func(fs.sendSoundStreamData!, [
            Var(fs.OperationId!, 'id'), 
            Var('FloatArray[]', 'block')
        ], 'void')`
            ${fs._assertOperationExists!}(id, "${fs.sendSoundStreamData!}")
            ${fs.i_sendSoundStreamData!}(id, block)
        `
    ]),

    // prettier-ignore
    imports: ({ ns: fs }, { globals }) => [
        Func(fs.i_openSoundWriteStream!, [
            Var(fs.OperationId!, 'id'),
            Var(fs.Url!, 'url'),
            Var(globals.msg!.Message!, 'info'),
        ], 'void')``,
        Func(fs.i_sendSoundStreamData!, [
            Var(fs.OperationId!, 'id'), 
            Var('FloatArray[]', 'block')
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore],
}
