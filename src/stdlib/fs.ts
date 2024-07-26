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
    codeGenerator: ({ globalCode, settings: { target } }) => {
        const content: Array<AstSequenceContent> = []
        if (target === 'assemblyscript') {
            content.push(`
                type ${globalCode.fs!.OperationId!} = Int
                type ${globalCode.fs!.OperationStatus!} = Int
                type ${globalCode.fs!.OperationCallback!} = (
                    id: ${globalCode.fs!.OperationId!}, 
                    status: ${globalCode.fs!.OperationStatus!}
                ) => void
                type ${globalCode.fs!.OperationSoundCallback!} = (
                    id: ${globalCode.fs!.OperationId!}, 
                    status: ${globalCode.fs!.OperationStatus!}, 
                    sound: FloatArray[]
                ) => void
                type ${globalCode.fs!.Url!} = string
            `)
        }
        // prettier-ignore
        return Sequence([
            ...content,
            ConstVar(
                'Int', 
                globalCode.fs!.OPERATION_SUCCESS!, 
                FS_OPERATION_SUCCESS.toString()
            ),
            ConstVar(
                'Int', 
                globalCode.fs!.OPERATION_FAILURE!, 
                FS_OPERATION_FAILURE.toString()
            ),
            
            ConstVar(
                `Set<${globalCode.fs!.OperationId!}>`, 
                globalCode.fs!._OPERATIONS_IDS!, 
                'new Set()'
            ),
            ConstVar(
                `Map<${globalCode.fs!.OperationId!}, ${globalCode.fs!.OperationCallback!}>`, 
                globalCode.fs!._OPERATIONS_CALLBACKS!, 
                'new Map()'
            ),
            
            ConstVar(
                `Map<${globalCode.fs!.OperationId!}, ${globalCode.fs!.OperationSoundCallback!}>`,
                globalCode.fs!._OPERATIONS_SOUND_CALLBACKS!,
                'new Map()',
            ),
    
            // We start at 1, because 0 is what ASC uses when host forgets to pass an arg to 
            // a function. Therefore we can get false negatives when a test happens to expect a 0.
            Var('Int', globalCode.fs!._OPERATIONS_COUNTER!, '1'),

            Class(globalCode.fs!.SoundInfo!, [
                Var('Int', 'channelCount'),
                Var('Int', 'sampleRate'),
                Var('Int', 'bitDepth'),
                Var('string', 'encodingFormat'),
                Var('string', 'endianness'),
                Var('string', 'extraOptions'),
            ]),

            Func(globalCode.fs!.soundInfoToMessage!, [
                Var(globalCode.fs!.SoundInfo!, 'soundInfo')
            ], globalCode.msg!.Message!)`
                ${ConstVar(globalCode.msg!.Message!, 'info', `${globalCode.msg!.create!}([
                    ${globalCode.msg!.FLOAT_TOKEN!},
                    ${globalCode.msg!.FLOAT_TOKEN!},
                    ${globalCode.msg!.FLOAT_TOKEN!},
                    ${globalCode.msg!.STRING_TOKEN!},
                    soundInfo.encodingFormat.length,
                    ${globalCode.msg!.STRING_TOKEN!},
                    soundInfo.endianness.length,
                    ${globalCode.msg!.STRING_TOKEN!},
                    soundInfo.extraOptions.length
                ])`)}
                ${globalCode.msg!.writeFloatToken!}(info, 0, toFloat(soundInfo.channelCount))
                ${globalCode.msg!.writeFloatToken!}(info, 1, toFloat(soundInfo.sampleRate))
                ${globalCode.msg!.writeFloatToken!}(info, 2, toFloat(soundInfo.bitDepth))
                ${globalCode.msg!.writeStringToken!}(info, 3, soundInfo.encodingFormat)
                ${globalCode.msg!.writeStringToken!}(info, 4, soundInfo.endianness)
                ${globalCode.msg!.writeStringToken!}(info, 5, soundInfo.extraOptions)
                return info
            `,
    
            Func(globalCode.fs!._assertOperationExists!, [
                Var(globalCode.fs!.OperationId!, 'id'), 
                Var('string', 'operationName'),
            ], 'void')`
                if (!${globalCode.fs!._OPERATIONS_IDS!}.has(id)) {
                    throw new Error(operationName + ' operation unknown : ' + id.toString())
                }
            `,
    
            Func(globalCode.fs!._createOperationId!, [], globalCode.fs!.OperationId!)`
                ${ConstVar(
                    globalCode.fs!.OperationId!, 
                    'id', 
                    `${globalCode.fs!._OPERATIONS_COUNTER!}++`
                )}
                ${globalCode.fs!._OPERATIONS_IDS!}.add(id)
                return id
            `
        ])
    },

    dependencies: [msg],
}

export const fsReadSoundFile: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ globalCode }) => Sequence([
        Func(globalCode.fs!.readSoundFile!, [
            Var(globalCode.fs!.Url!, 'url'),
            Var(globalCode.fs!.SoundInfo!, 'soundInfo'),
            Var(globalCode.fs!.OperationSoundCallback!, 'callback'),
        ], globalCode.fs!.OperationId!)`
            ${ConstVar(
                globalCode.fs!.OperationId!, 
                'id', 
                `${globalCode.fs!._createOperationId!}()`
            )}
            ${globalCode.fs!._OPERATIONS_SOUND_CALLBACKS!}.set(id, callback)
            ${globalCode.fs!.i_readSoundFile!}(id, url, ${globalCode.fs!.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(globalCode.fs!.x_onReadSoundFileResponse!, [
            Var(globalCode.fs!.OperationId!, 'id'),
            Var(globalCode.fs!.OperationStatus!, 'status'),
            Var('FloatArray[]', 'sound'),
        ], 'void')`
            ${globalCode.fs!._assertOperationExists!}(id, "${globalCode.fs!.x_onReadSoundFileResponse!}")
            ${globalCode.fs!._OPERATIONS_IDS!}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = ${globalCode.fs!._OPERATIONS_SOUND_CALLBACKS!}.get(id)
            callback(id, status, sound)
            ${globalCode.fs!._OPERATIONS_SOUND_CALLBACKS!}.delete(id)
        `
    ]),

    exports: ({ globalCode }) => [globalCode.fs!.x_onReadSoundFileResponse!],

    imports: ({ globalCode }) => [
        Func(
            globalCode.fs!.i_readSoundFile!,
            [
                Var(globalCode.fs!.OperationId!, 'id'),
                Var(globalCode.fs!.Url!, 'url'),
                Var(globalCode.msg!.Message!, 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsWriteSoundFile: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ globalCode }) => Sequence([
        Func(globalCode.fs!.writeSoundFile!, [
            Var('FloatArray[]', 'sound'),
            Var(globalCode.fs!.Url!, 'url'),
            Var(globalCode.fs!.SoundInfo!, 'soundInfo'),
            Var(globalCode.fs!.OperationCallback!, 'callback'),
        ], globalCode.fs!.OperationId!)`
            ${ConstVar(
                globalCode.fs!.OperationId!, 
                'id', 
                `${globalCode.fs!._createOperationId!}()`
            )}
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${globalCode.fs!.i_writeSoundFile!}(id, sound, url, ${globalCode.fs!.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(globalCode.fs!.x_onWriteSoundFileResponse!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var(globalCode.fs!.OperationStatus!, 'status'),
        ], 'void')`
            ${globalCode.fs!._assertOperationExists!}(id, "${globalCode.fs!.x_onWriteSoundFileResponse!}")
            ${globalCode.fs!._OPERATIONS_IDS!}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            ${ConstVar(globalCode.fs!.OperationCallback!, 'callback', `${globalCode.fs!._OPERATIONS_CALLBACKS!}.get(id)`)}
            callback(id, status)
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.delete(id)
        `
    ]),

    exports: ({ globalCode }) => [globalCode.fs!.x_onWriteSoundFileResponse!],

    imports: ({ globalCode }) => [
        Func(
            globalCode.fs!.i_writeSoundFile!,
            [
                Var(globalCode.fs!.OperationId!, 'id'),
                Var('FloatArray[]', 'sound'),
                Var(globalCode.fs!.Url!, 'url'),
                Var(globalCode.msg!.Message!, 'info'),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsSoundStreamCore: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ globalCode }) => Sequence([
        ConstVar(
            `Map<${globalCode.fs!.OperationId!}, Array<${globalCode.buf!.SoundBuffer!}>>`,
            globalCode.fs!._SOUND_STREAM_BUFFERS!,
            'new Map()'
        ),

        ConstVar(
            'Int',
            globalCode.fs!._SOUND_BUFFER_LENGTH!, 
            '20 * 44100',
        ),

        Func(globalCode.fs!.closeSoundStream!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var(globalCode.fs!.OperationStatus!, 'status'),
        ], 'void')`
            if (!${globalCode.fs!._OPERATIONS_IDS!}.has(id)) {
                return
            }
            ${globalCode.fs!._OPERATIONS_IDS!}.delete(id)
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.get(id)(id, status)
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.delete(id)
            // Delete this last, to give the callback 
            // a chance to save a reference to the buffer
            // If write stream, there won't be a buffer
            if (${globalCode.fs!._SOUND_STREAM_BUFFERS!}.has(id)) {
                ${globalCode.fs!._SOUND_STREAM_BUFFERS!}.delete(id)
            }
            ${globalCode.fs!.i_closeSoundStream!}(id, status)
        `,

        // =========================== EXPORTED API
        Func(globalCode.fs!.x_onCloseSoundStream!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var(globalCode.fs!.OperationStatus!, 'status'),
        ], 'void')`
            ${globalCode.fs!.closeSoundStream!}(id, status)
        `
    ]),

    exports: ({ globalCode }) => [globalCode.fs!.x_onCloseSoundStream!],

    // prettier-ignore
    imports: ({ globalCode }) => [
        Func(globalCode.fs!.i_closeSoundStream!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var(globalCode.fs!.OperationStatus!, 'status')
        ], 'void')``,
    ],

    dependencies: [bufCore, fsCore],
}

export const fsReadSoundStream: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ globalCode }) => Sequence([
        Func(globalCode.fs!.openSoundReadStream!, [
            Var(globalCode.fs!.Url!, 'url'),
            Var(globalCode.fs!.SoundInfo!, 'soundInfo'),
            Var(globalCode.fs!.OperationCallback!, 'callback'),
        ], globalCode.fs!.OperationId!)`
            ${ConstVar(
                globalCode.fs!.OperationId!, 
                'id', 
                `${globalCode.fs!._createOperationId!}()`
            )}
            ${ConstVar(
                `Array<${globalCode.buf!.SoundBuffer!}>`, 
                'buffers', 
                '[]'
            )}
            for (${Var('Int', 'channel', '0')}; channel < soundInfo.channelCount; channel++) {
                buffers.push(${globalCode.buf!.create!}(${globalCode.fs!._SOUND_BUFFER_LENGTH!}))
            }
            ${globalCode.fs!._SOUND_STREAM_BUFFERS!}.set(id, buffers)
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${globalCode.fs!.i_openSoundReadStream!}(id, url, ${globalCode.fs!.soundInfoToMessage!}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(globalCode.fs!.x_onSoundStreamData!, [
            Var(globalCode.fs!.OperationId!, 'id'),
            Var('FloatArray[]', 'block'),
        ], 'Int')`
            ${globalCode.fs!._assertOperationExists!}(id, "${globalCode.fs!.x_onSoundStreamData!}")
            const buffers = ${globalCode.fs!._SOUND_STREAM_BUFFERS!}.get(id)
            for (${Var('Int', 'i', '0')}; i < buffers.length; i++) {
                ${globalCode.buf!.pushBlock!}(buffers[i], block[i])
            }
            return buffers[0].pullAvailableLength
        `
    ]),

    exports: ({ globalCode }) => [globalCode.fs!.x_onSoundStreamData!],

    // prettier-ignore
    imports: ({ globalCode }) => [
        Func(globalCode.fs!.i_openSoundReadStream!, [
            Var(globalCode.fs!.OperationId!, 'id'),
            Var(globalCode.fs!.Url!, 'url'),
            Var(globalCode.msg!.Message!, 'info'),
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore, bufPushPull],
}

export const fsWriteSoundStream: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ globalCode }) => Sequence([
        Func(globalCode.fs!.openSoundWriteStream!, [
                Var(globalCode.fs!.Url!, 'url'),
                Var(globalCode.fs!.SoundInfo!, 'soundInfo'),
                Var(globalCode.fs!.OperationCallback!, 'callback'),
            ],
            globalCode.fs!.OperationId!
        )`
            const id = ${globalCode.fs!._createOperationId!}()
            ${globalCode.fs!._SOUND_STREAM_BUFFERS!}.set(id, [])
            ${globalCode.fs!._OPERATIONS_CALLBACKS!}.set(id, callback)
            ${globalCode.fs!.i_openSoundWriteStream!}(id, url, ${globalCode.fs!.soundInfoToMessage!}(soundInfo))
            return id
        `,

        Func(globalCode.fs!.sendSoundStreamData!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var('FloatArray[]', 'block')
        ], 'void')`
            ${globalCode.fs!._assertOperationExists!}(id, "${globalCode.fs!.sendSoundStreamData!}")
            ${globalCode.fs!.i_sendSoundStreamData!}(id, block)
        `
    ]),

    // prettier-ignore
    imports: ({ globalCode }) => [
        Func(globalCode.fs!.i_openSoundWriteStream!, [
            Var(globalCode.fs!.OperationId!, 'id'),
            Var(globalCode.fs!.Url!, 'url'),
            Var(globalCode.msg!.Message!, 'info'),
        ], 'void')``,
        Func(globalCode.fs!.i_sendSoundStreamData!, [
            Var(globalCode.fs!.OperationId!, 'id'), 
            Var('FloatArray[]', 'block')
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore],
}
