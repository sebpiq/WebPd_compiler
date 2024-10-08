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

import { GlobalDefinitions } from '../../compile/types'
import { bufCore, bufPushPull } from '../buf/buf'
import { msg } from '../msg/msg'
import { Sequence, Class, ConstVar, Func, Var } from '../../ast/declare'
import { AstSequenceContent } from '../../ast/types'
import { FsExportsAssemblyScript, FsNamespaceAll } from './types'
import { FS_OPERATION_FAILURE, FS_OPERATION_SUCCESS } from './constants'

const NAMESPACE = 'fs'

export const fsCore: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,
    code: ({ ns: fs }, { msg }, { target }) => {
        const content: Array<AstSequenceContent> = []
        if (target === 'assemblyscript') {
            content.push(`
                type ${fs.OperationId} = Int
                type ${fs.OperationStatus} = Int
                type ${fs.OperationCallback} = (
                    id: ${fs.OperationId}, 
                    status: ${fs.OperationStatus}
                ) => void
                type ${fs.OperationSoundCallback} = (
                    id: ${fs.OperationId}, 
                    status: ${fs.OperationStatus}, 
                    sound: FloatArray[]
                ) => void
                type ${fs.Url} = string
            `)
        }
        // prettier-ignore
        return Sequence([
            ...content,
            ConstVar(
                'Int', 
                fs.OPERATION_SUCCESS, 
                FS_OPERATION_SUCCESS.toString()
            ),
            ConstVar(
                'Int', 
                fs.OPERATION_FAILURE, 
                FS_OPERATION_FAILURE.toString()
            ),
            
            ConstVar(
                `Set<${fs.OperationId}>`, 
                fs._OPERATIONS_IDS, 
                'new Set()'
            ),
            ConstVar(
                `Map<${fs.OperationId}, ${fs.OperationCallback}>`, 
                fs._OPERATIONS_CALLBACKS, 
                'new Map()'
            ),
            
            ConstVar(
                `Map<${fs.OperationId}, ${fs.OperationSoundCallback}>`,
                fs._OPERATIONS_SOUND_CALLBACKS,
                'new Map()',
            ),
    
            // We start at 1, because 0 is what ASC uses when host forgets to pass an arg to 
            // a function. Therefore we can get false negatives when a test happens to expect a 0.
            Var(`Int`, fs._OPERATIONS_COUNTER, `1`),

            Class(fs.SoundInfo, [
                Var(`Int`, `channelCount`),
                Var(`Int`, `sampleRate`),
                Var(`Int`, `bitDepth`),
                Var(`string`, `encodingFormat`),
                Var(`string`, `endianness`),
                Var(`string`, `extraOptions`),
            ]),

            Func(fs.soundInfoToMessage, [
                Var(fs.SoundInfo, `soundInfo`)
            ], msg.Message)`
                ${ConstVar(msg.Message, `info`, `${msg.create}([
                    ${msg.FLOAT_TOKEN},
                    ${msg.FLOAT_TOKEN},
                    ${msg.FLOAT_TOKEN},
                    ${msg.STRING_TOKEN},
                    soundInfo.encodingFormat.length,
                    ${msg.STRING_TOKEN},
                    soundInfo.endianness.length,
                    ${msg.STRING_TOKEN},
                    soundInfo.extraOptions.length
                ])`)}
                ${msg.writeFloatToken}(info, 0, toFloat(soundInfo.channelCount))
                ${msg.writeFloatToken}(info, 1, toFloat(soundInfo.sampleRate))
                ${msg.writeFloatToken}(info, 2, toFloat(soundInfo.bitDepth))
                ${msg.writeStringToken}(info, 3, soundInfo.encodingFormat)
                ${msg.writeStringToken}(info, 4, soundInfo.endianness)
                ${msg.writeStringToken}(info, 5, soundInfo.extraOptions)
                return info
            `,
    
            Func(fs._assertOperationExists, [
                Var(fs.OperationId, `id`), 
                Var(`string`, `operationName`),
            ], 'void')`
                if (!${fs._OPERATIONS_IDS}.has(id)) {
                    throw new Error(operationName + ' operation unknown : ' + id.toString())
                }
            `,
    
            Func(fs._createOperationId, [], fs.OperationId)`
                ${ConstVar(
                    fs.OperationId, 
                    'id', 
                    `${fs._OPERATIONS_COUNTER}++`
                )}
                ${fs._OPERATIONS_IDS}.add(id)
                return id
            `
        ])
    },

    dependencies: [msg],
}

export const fsReadSoundFile: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.readSoundFile, [
            Var(fs.Url, `url`),
            Var(fs.SoundInfo, `soundInfo`),
            Var(fs.OperationSoundCallback, `callback`),
        ], fs.OperationId)`
            ${ConstVar(
                fs.OperationId, 
                'id', 
                `${fs._createOperationId}()`
            )}
            ${fs._OPERATIONS_SOUND_CALLBACKS}.set(id, callback)
            ${fs.i_readSoundFile}(id, url, ${fs.soundInfoToMessage}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onReadSoundFileResponse, [
            Var(fs.OperationId, `id`),
            Var(fs.OperationStatus, `status`),
            Var(`FloatArray[]`, `sound`),
        ], 'void')`
            ${fs._assertOperationExists}(id, "${fs.x_onReadSoundFileResponse}")
            ${fs._OPERATIONS_IDS}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            const callback = ${fs._OPERATIONS_SOUND_CALLBACKS}.get(id)
            callback(id, status, sound)
            ${fs._OPERATIONS_SOUND_CALLBACKS}.delete(id)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onReadSoundFileResponse],

    imports: ({ ns: fs }, { msg }) => [
        Func(
            fs.i_readSoundFile,
            [
                Var(fs.OperationId, `id`),
                Var(fs.Url, `url`),
                Var(msg.Message, `info`),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsWriteSoundFile: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.writeSoundFile, [
            Var(`FloatArray[]`, `sound`),
            Var(fs.Url, `url`),
            Var(fs.SoundInfo, `soundInfo`),
            Var(fs.OperationCallback, `callback`),
        ], fs.OperationId)`
            ${ConstVar(
                fs.OperationId, 
                'id', 
                `${fs._createOperationId}()`
            )}
            ${fs._OPERATIONS_CALLBACKS}.set(id, callback)
            ${fs.i_writeSoundFile}(id, sound, url, ${fs.soundInfoToMessage}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onWriteSoundFileResponse, [
            Var(fs.OperationId, `id`), 
            Var(fs.OperationStatus, `status`),
        ], 'void')`
            ${fs._assertOperationExists}(id, "${fs.x_onWriteSoundFileResponse}")
            ${fs._OPERATIONS_IDS}.delete(id)
            // Finish cleaning before calling the callback in case it would throw an error.
            ${ConstVar(fs.OperationCallback, `callback`, `${fs._OPERATIONS_CALLBACKS}.get(id)`)}
            callback(id, status)
            ${fs._OPERATIONS_CALLBACKS}.delete(id)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onWriteSoundFileResponse],

    imports: ({ ns: fs }, { msg }) => [
        Func(
            fs.i_writeSoundFile,
            [
                Var(fs.OperationId, `id`),
                Var(`FloatArray[]`, `sound`),
                Var(fs.Url, `url`),
                Var(msg.Message, `info`),
            ],
            'void'
        )``,
    ],

    dependencies: [fsCore],
}

export const fsSoundStreamCore: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }, { buf }) => Sequence([
        ConstVar(
            `Map<${fs.OperationId}, Array<${buf!.SoundBuffer}>>`,
            fs.SOUND_STREAM_BUFFERS,
            'new Map()'
        ),

        ConstVar(
            'Int',
            fs._SOUND_BUFFER_LENGTH, 
            '20 * 44100',
        ),

        Func(fs.closeSoundStream, [
            Var(fs.OperationId, `id`), 
            Var(fs.OperationStatus, `status`),
        ], 'void')`
            if (!${fs._OPERATIONS_IDS}.has(id)) {
                return
            }
            ${fs._OPERATIONS_IDS}.delete(id)
            ${fs._OPERATIONS_CALLBACKS}.get(id)(id, status)
            ${fs._OPERATIONS_CALLBACKS}.delete(id)
            // Delete this last, to give the callback 
            // a chance to save a reference to the buffer
            // If write stream, there won't be a buffer
            if (${fs.SOUND_STREAM_BUFFERS}.has(id)) {
                ${fs.SOUND_STREAM_BUFFERS}.delete(id)
            }
            ${fs.i_closeSoundStream}(id, status)
        `,

        // =========================== EXPORTED API
        Func(fs.x_onCloseSoundStream, [
            Var(fs.OperationId, `id`), 
            Var(fs.OperationStatus, `status`),
        ], 'void')`
            ${fs.closeSoundStream}(id, status)
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onCloseSoundStream],

    // prettier-ignore
    imports: ({ ns: fs }) => [
        Func(fs.i_closeSoundStream, [
            Var(fs.OperationId, `id`), 
            Var(fs.OperationStatus, `status`)
        ], 'void')``,
    ],

    dependencies: [bufCore, fsCore],
}

export const fsReadSoundStream: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }, { buf }) => Sequence([
        Func(fs.openSoundReadStream, [
            Var(fs.Url, `url`),
            Var(fs.SoundInfo, `soundInfo`),
            Var(fs.OperationCallback, `callback`),
        ], fs.OperationId)`
            ${ConstVar(
                fs.OperationId, 
                'id', 
                `${fs._createOperationId}()`
            )}
            ${ConstVar(
                `Array<${buf!.SoundBuffer}>`, 
                'buffers', 
                '[]'
            )}
            for (${Var(`Int`, `channel`, `0`)}; channel < soundInfo.channelCount; channel++) {
                buffers.push(${buf!.create}(${fs._SOUND_BUFFER_LENGTH}))
            }
            ${fs.SOUND_STREAM_BUFFERS}.set(id, buffers)
            ${fs._OPERATIONS_CALLBACKS}.set(id, callback)
            ${fs.i_openSoundReadStream}(id, url, ${fs.soundInfoToMessage}(soundInfo))
            return id
        `,

        // =========================== EXPORTED API
        Func(fs.x_onSoundStreamData, [
            Var(fs.OperationId, `id`),
            Var(`FloatArray[]`, `block`),
        ], 'Int')`
            ${fs._assertOperationExists}(id, "${fs.x_onSoundStreamData}")
            const buffers = ${fs.SOUND_STREAM_BUFFERS}.get(id)
            for (${Var(`Int`, `i`, `0`)}; i < buffers.length; i++) {
                ${buf!.pushBlock!}(buffers[i], block[i])
            }
            return buffers[0].pullAvailableLength
        `
    ]),

    exports: ({ ns: fs }) => [fs.x_onSoundStreamData],

    // prettier-ignore
    imports: ({ ns: fs }, { msg }) => [
        Func(fs.i_openSoundReadStream, [
            Var(fs.OperationId, `id`),
            Var(fs.Url, `url`),
            Var(msg.Message, `info`),
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore, bufPushPull],
}

export const fsWriteSoundStream: GlobalDefinitions<
    keyof FsNamespaceAll,
    keyof FsExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: fs }) => Sequence([
        Func(fs.openSoundWriteStream, [
                Var(fs.Url, `url`),
                Var(fs.SoundInfo, `soundInfo`),
                Var(fs.OperationCallback, `callback`),
            ],
            fs.OperationId
        )`
            const id = ${fs._createOperationId}()
            ${fs.SOUND_STREAM_BUFFERS}.set(id, [])
            ${fs._OPERATIONS_CALLBACKS}.set(id, callback)
            ${fs.i_openSoundWriteStream}(id, url, ${fs.soundInfoToMessage}(soundInfo))
            return id
        `,

        Func(fs.sendSoundStreamData, [
            Var(fs.OperationId, `id`), 
            Var(`FloatArray[]`, `block`)
        ], 'void')`
            ${fs._assertOperationExists}(id, "${fs.sendSoundStreamData}")
            ${fs.i_sendSoundStreamData}(id, block)
        `
    ]),

    // prettier-ignore
    imports: ({ ns: fs }, { msg }) => [
        Func(fs.i_openSoundWriteStream, [
            Var(fs.OperationId, `id`),
            Var(fs.Url, `url`),
            Var(msg.Message, `info`),
        ], 'void')``,

        Func(fs.i_sendSoundStreamData, [
            Var(fs.OperationId, `id`), 
            Var(`FloatArray[]`, `block`)
        ], 'void')``,
    ],

    dependencies: [fsSoundStreamCore],
}
