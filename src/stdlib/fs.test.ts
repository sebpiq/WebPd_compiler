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
import { runTestSuite } from '../test-helpers'
import {
    fsCore,
    fsReadSoundFile,
    fsReadSoundStream,
    fsSoundStreamCore,
    fsWriteSoundFile,
    fsWriteSoundStream,
} from './fs'
import { bufCore, bufPushPull } from './buf'
import { core } from './core'
import { msg } from './msg'
import { Sequence, ConstVar, Func, Var, AnonFunc } from '../ast/declare'

describe('fs', () => {
    runTestSuite(
        [
            {
                description:
                    'sound info > should be able to convert SoundInfo to Message %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${ConstVar(globalCode.fs!.SoundInfo!, 'soundInfo', `{
                        channelCount: 2,
                        sampleRate: 48000,
                        bitDepth: 24,
                        encodingFormat: 'wave',
                        endianness: 'l',
                        extraOptions: '--blo --bli',
                    }`)}
                    ${ConstVar(
                        globalCode.msg!.Message!,
                        'soundInfoMessage',
                        `${globalCode.fs!.soundInfoToMessage!}(soundInfo)`,
                    )}
                    assert_floatsEqual(${globalCode.msg!.readFloatToken!}(soundInfoMessage, 0), 2)
                    assert_floatsEqual(${globalCode.msg!.readFloatToken!}(soundInfoMessage, 1), 48000)
                    assert_floatsEqual(${globalCode.msg!.readFloatToken!}(soundInfoMessage, 2), 24)
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(soundInfoMessage, 3), 'wave')
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(soundInfoMessage, 4), 'l')
                    assert_stringsEqual(${globalCode.msg!.readStringToken!}(soundInfoMessage, 5), '--blo --bli')
                `,
            },
            {
                description:
                    'readSoundFile > should create the operation %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.readSoundFile!}(
                            '/some/url', 
                            {
                                channelCount: 4, 
                                sampleRate: 44100, 
                                bitDepth: 32, 
                                encodingFormat: 'wave', 
                                endianness: 'b', 
                                extraOptions: ''
                            },
                            someSoundCallback
                        )`,
                    )}
            
                    assert_stringsEqual(calls[0], 'readSoundFile')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], ${globalCode.fs!.soundInfoToMessage!}({
                        channelCount: 4, 
                        sampleRate: 44100, 
                        bitDepth: 32, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))
                    assert_booleansEqual(${globalCode.fs!._OPERATIONS_IDS!}.has(operationId), true)
                `,
            },

            {
                description:
                    'fs_sendReadSoundFileResponse > should register the operation success and call the callback %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.readSoundFile!}(
                            '/some/url', 
                            {
                                channelCount: 3,
                                sampleRate: 44100,
                                bitDepth: 32,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: ''
                            }, 
                            someSoundCallback
                        )`,
                    )}
                    assert_integersEqual(callbackOperationId, 0)

                    // 2. Operation is done, call fs_sendReadSoundFileResponse
                    ${Var('FloatArray[]', 'sound', `[
                        createFloatArray(3),
                        createFloatArray(3),
                        createFloatArray(3),
                    ]`)}
                    sound[0].set([-0.1, -0.2, -0.3])
                    sound[1].set([0.4, 0.5, 0.6])
                    sound[2].set([-0.7, -0.8, -0.9])
                    ${globalCode.fs!.x_onReadSoundFileResponse!}(
                        operationId,
                        ${globalCode.fs!.OPERATION_SUCCESS!},
                        sound
                    )

                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_SUCCESS!})
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_operationCleaned(operationId)
                    assert_integersEqual(callbackOperationSound.length, 3)
                    assert_floatArraysEqual(callbackOperationSound[0], sound[0])
                    assert_floatArraysEqual(callbackOperationSound[1], sound[1])
                    assert_floatArraysEqual(callbackOperationSound[2], sound[2])
                `,
            },

            {
                description:
                    'fs_sendReadSoundFileResponse > should register the operation failure %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.readSoundFile!}(
                            '/some/url', 
                            {
                                channelCount: 1,
                                sampleRate: 44100,
                                bitDepth: 32,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someSoundCallback
                        )`,
                    )}

                    ${globalCode.fs!.x_onReadSoundFileResponse!}(
                        operationId,
                        ${globalCode.fs!.OPERATION_FAILURE!},
                        []
                    )
                    assert_integersEqual(
                        callbackOperationId,
                        operationId
                    )
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_FAILURE!})
                `,
            },

            {
                description:
                    'openSoundReadStream > should create the operation %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${ConstVar('Int', 'channelCount', '22')}
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundReadStream!}(
                            '/some/url', 
                            {
                                channelCount: channelCount,
                                sampleRate: 44100,
                                bitDepth: 32,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`,
                    )}

                    assert_stringsEqual(calls[0], 'openSoundReadStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], ${globalCode.fs!.soundInfoToMessage!}({
                        channelCount: 22, 
                        sampleRate: 44100, 
                        bitDepth: 32, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))

                    assert_booleansEqual(${globalCode.fs!._OPERATIONS_IDS!}.has(operationId), true)
                    assert_booleansEqual(${globalCode.fs!._SOUND_STREAM_BUFFERS!}.has(operationId), true)
                    assert_integersEqual(${globalCode.fs!._SOUND_STREAM_BUFFERS!}.get(operationId).length, channelCount)
                `,
            },

            {
                description:
                    'fs_onSoundStreamData > should push data to the buffer %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${Var('Int', 'availableFrameCount', '0')}
                    ${Var('FloatArray[]', 'data', '[]')}

                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundReadStream!}(
                            '/some/url', 
                            {
                                channelCount: 2,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            },
                            someCallback
                        )`,
                    )}

                    // 2. Send in some sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([-11, -22, -33])
                    data[1].set([11, 22, 33])
                    availableFrameCount = ${globalCode.fs!.x_onSoundStreamData!}(operationId, data)
                    assert_integersEqual(availableFrameCount, 3)

                    // 3. Send in more sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([44, 55, 66])
                    data[1].set([-44, -55, -66])
                    availableFrameCount = ${globalCode.fs!.x_onSoundStreamData!}(operationId, data)
                    assert_integersEqual(availableFrameCount, 6)

                    // 4. Send in more sound than the buffer can hold
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([77, 88, 99])
                    data[1].set([-77, -88, -99])
                    availableFrameCount = ${globalCode.fs!.x_onSoundStreamData!}(operationId, data)
                    assert_integersEqual(availableFrameCount, 9)

                    // 5. Testing buffer contents
                    ${Func('pullSample', [
                        Var(globalCode.fs!.OperationId!, 'operationId')
                    ], 'Float')`
                        return ${globalCode.buf!.pullSample!}(${globalCode.fs!._SOUND_STREAM_BUFFERS!}.get(operationId)[0])
                    `}
                    assert_floatsEqual(pullSample(operationId), -11)
                    assert_floatsEqual(pullSample(operationId), -22)
                    assert_floatsEqual(pullSample(operationId), -33)
                    assert_floatsEqual(pullSample(operationId), 44)
                    assert_floatsEqual(pullSample(operationId), 55)
                    assert_floatsEqual(pullSample(operationId), 66)
                    assert_floatsEqual(pullSample(operationId), 77)
                `,
            },

            {
                description:
                    'closeSoundStream > should close the read stream and call the callback %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${Var('FloatArray[]', 'data', '[]')}

                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundReadStream!}(
                            '/some/url', 
                            {
                                channelCount: 2,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`,
                    )}

                    // 2. Send in some sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([-0.1, -0.2, -0.3])
                    data[1].set([0.1, 0.2, 0.3])
                    ${globalCode.fs!.x_onSoundStreamData!}(operationId, data)

                    // 3. close stream
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'openSoundReadStream')
                    assert_integersEqual(callbackOperationId, 0)
                    ${globalCode.fs!.x_onCloseSoundStream!}(operationId, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test callback in host space was called
                    assert_integersEqual(calls.length, 2)
                    assert_stringsEqual(calls[1], 'closeSoundStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_integersEqual(status_received, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test callback in module was called
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test operation was cleaned
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'openSoundWriteStream > should create the operation %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundWriteStream!}(
                            '/some/url', 
                            {
                                channelCount: 4,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`,
                    )}
        
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'openSoundWriteStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], ${globalCode.fs!.soundInfoToMessage!}({
                        channelCount: 4, 
                        sampleRate: 44100, 
                        bitDepth: 24, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))
                    assert_booleansEqual(${globalCode.fs!._OPERATIONS_IDS!}.has(operationId), true)
                `,
            },

            {
                description:
                    'sendSoundStreamData > should push data to the buffer %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${Var('Float', 'counter', '0')}
                    ${Var('FloatArray[]', 'data', '[]')}

                    ${Func('testSendSoundStreamData', [
                        Var('Float', 'counter'), 
                        Var(globalCode.fs!.OperationId!, 'id')
                    ], 'void')`
                        ${ConstVar('FloatArray[]', 'block', `[
                            createFloatArray(4),
                            createFloatArray(4),
                        ]`)}
                        block[0][0] = 10 + 4 * counter
                        block[0][1] = 11 + 4 * counter
                        block[0][2] = 12 + 4 * counter
                        block[0][3] = 13 + 4 * counter
                        block[1][0] = 20 + 4 * counter
                        block[1][1] = 21 + 4 * counter
                        block[1][2] = 22 + 4 * counter
                        block[1][3] = 23 + 4 * counter
                        ${globalCode.fs!.sendSoundStreamData!}(id, block)
                    `}

                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundWriteStream!}(
                            '/some/url', 
                            {
                                channelCount: 2,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`,
                    )}

                    // 2. Receive some sound
                    testSendSoundStreamData(counter++, operationId)
                    testSendSoundStreamData(counter++, operationId)
                    assert_integersEqual(calls.length, 3)
                    assert_stringsEqual(calls[0], 'openSoundWriteStream')
                    assert_stringsEqual(calls[1], 'sendSoundStreamData')
                    assert_stringsEqual(calls[2], 'sendSoundStreamData')

                    assert_integersEqual(id_received[1], operationId)
                    data = [
                        createFloatArray(4),
                        createFloatArray(4),
                    ]
                    data[0].set([10, 11, 12, 13])
                    data[1].set([20, 21, 22, 23])
                    assert_floatArraysEqual(sound_received[0][0], data[0])
                    assert_floatArraysEqual(sound_received[0][1], data[1])
                    
                    assert_integersEqual(id_received[2], operationId)
                    data = [
                        createFloatArray(4),
                        createFloatArray(4),
                    ]
                    data[0].set([14, 15, 16, 17])
                    data[1].set([24, 25, 26, 27])
                    assert_floatArraysEqual(sound_received[1][0], data[0])
                    assert_floatArraysEqual(sound_received[1][1], data[1])
                `,
            },

            {
                description:
                    'closeSoundStream > should close the write stream and call the callback %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()
                    ${Func('testSendSoundStreamData', [
                        Var(globalCode.fs!.OperationId!, 'id')
                    ], 'void')`
                        ${ConstVar(
                            'FloatArray[]',
                            'block',
                            '[createFloatArray(2)]',
                        )}
                        ${globalCode.fs!.sendSoundStreamData!}(id, block)
                    `}
    
                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.openSoundWriteStream!}(
                            '/some/url', 
                            {
                                channelCount: 1,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`,
                    )}

                    // 2. Receive some sound
                    testSendSoundStreamData(operationId)

                    // 3. close stream
                    assert_integersEqual(calls.length, 2)
                    ${globalCode.fs!.x_onCloseSoundStream!}(operationId, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test callback in host space was called
                    assert_integersEqual(calls.length, 3)
                    assert_stringsEqual(calls[2], 'closeSoundStream')
                    assert_integersEqual(id_received[2], operationId)
                    assert_integersEqual(status_received, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test callback in wasm was called
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_SUCCESS!})
                    // Test operation was cleaned
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'writeSoundFile > should create the operation %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()

                    ${ConstVar('FloatArray[]', 'sound', `[
                        createFloatArray(4),
                        createFloatArray(4),
                        createFloatArray(4),
                    ]`)}
                    sound[0].set([11, 12, 13, 14])
                    sound[1].set([21, 22, 23, 24])
                    sound[2].set([31, 32, 33, 34])
                
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.writeSoundFile!}(
                            sound, 
                            '/some/url', 
                            {
                                channelCount: sound.length,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            },
                            someCallback
                        )`
                    )}
        
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'writeSoundFile')
                    assert_integersEqual(id_received[0], operationId)
                    assert_floatArraysEqual(sound_received[0][0], sound[0])
                    assert_floatArraysEqual(sound_received[0][1], sound[1])
                    assert_floatArraysEqual(sound_received[0][2], sound[2])
                    assert_booleansEqual(${globalCode.fs!._OPERATIONS_IDS!}.has(operationId), true)
                `,
            },

            {
                description:
                    'fs_sendWriteSoundFileResponse > should register the operation success and call the callback %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()

                    ${ConstVar('FloatArray[]', 'sound', `[
                        createFloatArray(512),
                        createFloatArray(512),
                    ]`)}

                    // 1. Create the operation
                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.writeSoundFile!}(
                            sound, 
                            '/some/url', 
                            {
                                channelCount: sound.length,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`
                    )}
                    assert_integersEqual(callbackOperationId, 0)
        
                    // 2. Operation is done, call fs_sendWriteSoundFileResponse
                    ${globalCode.fs!.x_onWriteSoundFileResponse!}(
                        operationId,
                        ${globalCode.fs!.OPERATION_SUCCESS!}
                    )
        
                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_SUCCESS!})
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'fs_sendWriteSoundFileResponse > should register the operation failure %s',
                testFunction: ({ globalCode }) => AnonFunc()`
                    initializeTest()

                    ${ConstVar('FloatArray[]', 'sound', `[
                        createFloatArray(512),
                        createFloatArray(512),
                    ]`)}

                    ${ConstVar(
                        globalCode.fs!.OperationId!,
                        'operationId',
                        `${globalCode.fs!.writeSoundFile!}(
                            sound, 
                            '/some/url', 
                            {
                                channelCount: sound.length,
                                sampleRate: 44100,
                                bitDepth: 24,
                                encodingFormat: 'wave',
                                endianness: 'b',
                                extraOptions: '',
                            }, 
                            someCallback
                        )`
                    )}

                    ${globalCode.fs!.x_onWriteSoundFileResponse!}(operationId, ${globalCode.fs!.OPERATION_FAILURE!})
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, ${globalCode.fs!.OPERATION_FAILURE!})
                `,
            },
        ],
        [
            core.codeGenerator,
            msg.codeGenerator,
            bufCore,
            bufPushPull,
            fsCore,
            fsReadSoundFile.codeGenerator,
            fsWriteSoundFile.codeGenerator,
            fsSoundStreamCore.codeGenerator,
            fsReadSoundStream.codeGenerator,
            fsWriteSoundStream.codeGenerator,
            ({ globalCode }) => Sequence([
                // Global test variables
                Var('Array<string>', 'calls', '[]'),
                Var(`Array<${globalCode.fs!.OperationId!}>`, 'id_received', '[]'),
                Var('FloatArray[][]', 'sound_received', '[]'),
                Var(`Array<${globalCode.fs!.Url!}>`, 'url_received', '[]'),
                Var(`Array<${globalCode.msg!.Message!}>`, 'info_received', '[]'),
                Var(globalCode.fs!.OperationStatus!, 'status_received', '-1'),
                Var('Int', 'callbackOperationId', '0'),
                Var(globalCode.fs!.OperationStatus!, 'callbackOperationStatus', '-1'),
                Var('FloatArray[]', 'callbackOperationSound', '[]'),
                
                Func('initializeTest')`
                    calls = []        
                    id_received = []
                    sound_received = []
                    url_received = []
                    info_received = []
                    status_received = -1

                    callbackOperationId = 0
                    callbackOperationStatus = -1
                    callbackOperationSound = []
                `,

                // Dummy import
                Func(globalCode.fs!.i_readSoundFile!, [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.Url!, 'url'),
                    Var(globalCode.msg!.Message!, 'info'),
                ], 'void')`
                    calls.push('readSoundFile')
                    id_received.push(id)
                    url_received.push(url)
                    info_received.push(info)
                `,

                Func(globalCode.fs!.i_openSoundReadStream!, [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.Url!, 'url'),
                    Var(globalCode.msg!.Message!, 'info'),
                ], 'void')`
                    calls.push('openSoundReadStream')
                    id_received.push(id)
                    url_received.push(url)
                    info_received.push(info)
                `,

                Func(globalCode.fs!.i_openSoundWriteStream!, [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.Url!, 'url'),
                    Var(globalCode.msg!.Message!, 'info'),
                ], 'void')`
                    calls.push('openSoundWriteStream')
                    id_received.push(id)
                    url_received.push(url)
                    info_received.push(info)
                `,

                Func(globalCode.fs!.i_writeSoundFile!, [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var('FloatArray[]', 'sound'),
                    Var(globalCode.fs!.Url!, 'url'),
                    Var(globalCode.msg!.Message!, 'info'),
                ], 'void')`
                    calls.push('writeSoundFile')
                    id_received.push(id)
                    sound_received.push(sound)
                    url_received.push(url)
                    info_received.push(info)
                `,

                Func(globalCode.fs!.i_sendSoundStreamData!, [
                    Var(globalCode.fs!.OperationId!, 'id'), 
                    Var('FloatArray[]', 'sound')
                ], 'void')`
                    calls.push('sendSoundStreamData')
                    id_received.push(id)
                    sound_received.push(sound)
                `,

                Func(globalCode.fs!.i_closeSoundStream!, [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.OperationStatus!, 'status'),
                ], 'void')`
                    calls.push('closeSoundStream')
                    id_received.push(id)
                    status_received = status
                `,

                Func('someSoundCallback', [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.OperationStatus!, 'status'),
                    Var('FloatArray[]', 'sound'),
                ], 'void')`
                    callbackOperationId = id
                    callbackOperationStatus = status
                    callbackOperationSound = sound
                `,

                Func('someCallback', [
                    Var(globalCode.fs!.OperationId!, 'id'),
                    Var(globalCode.fs!.OperationStatus!, 'status'),
                ], 'void')`
                    callbackOperationId = id
                    callbackOperationStatus = status
                `,

                Func('assert_operationCleaned', [
                    Var(globalCode.fs!.OperationId!, 'id')
                ], 'void')`
                    if(
                        ${globalCode.fs!._OPERATIONS_IDS!}.has(id)
                        || ${globalCode.fs!._OPERATIONS_CALLBACKS!}.has(id)
                        || ${globalCode.fs!._OPERATIONS_SOUND_CALLBACKS!}.has(id)
                        || ${globalCode.fs!._SOUND_STREAM_BUFFERS!}.has(id)
                    ) {
                        reportTestFailure('operation ' + id.toString() + ' was not cleaned properly')
                    }
                `,

                Func('assert_soundInfoMessagesEqual', [
                    Var(globalCode.msg!.Message!, 'actual'), 
                    Var(globalCode.msg!.Message!, 'expected')
                ], 'void')`
                    if (!${globalCode.msg!.isMatching!}(actual, [
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}
                    ])) {
                        reportTestFailure('Unexpected sound info message shape for <actual> arg')
                    }
                    
                    if (!${globalCode.msg!.isMatching!}(expected, [
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.FLOAT_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}, 
                        ${globalCode.msg!.STRING_TOKEN!}
                    ])) {
                        reportTestFailure('Unexpected sound info message shape for <expected> arg')
                    }

                    const actualChannelCount = ${globalCode.msg!.readFloatToken!}(actual, 0)
                    const expectedChannelCount = ${globalCode.msg!.readFloatToken!}(expected, 0)
                    if (actualChannelCount !== expectedChannelCount) {
                        reportTestFailure(
                            'Got SoundInfo.channelCount ' + actualChannelCount.toString() 
                            + ' expected ' + expectedChannelCount.toString())
                    }

                    const actualSampleRate = ${globalCode.msg!.readFloatToken!}(actual, 1)
                    const expectedSampleRate = ${globalCode.msg!.readFloatToken!}(expected, 1)
                    if (actualSampleRate !== expectedSampleRate) {
                        reportTestFailure(
                            'Got SoundInfo.sampleRate ' + actualSampleRate.toString() 
                            + ' expected ' + expectedSampleRate.toString())
                    }

                    const actualBitDepth = ${globalCode.msg!.readFloatToken!}(actual, 2)
                    const expectedBitDepth = ${globalCode.msg!.readFloatToken!}(expected, 2)
                    if (actualBitDepth !== expectedBitDepth) {
                        reportTestFailure(
                            'Got SoundInfo.bitDepth ' + actualBitDepth.toString() 
                            + ' expected ' + expectedBitDepth.toString())
                    }

                    const actualEncodingFormat = ${globalCode.msg!.readStringToken!}(actual, 3)
                    const expectedEncodingFormat = ${globalCode.msg!.readStringToken!}(expected, 3)
                    if (actualEncodingFormat !== expectedEncodingFormat) {
                        reportTestFailure(
                            'Got SoundInfo.encodingFormat ' + actualEncodingFormat.toString() 
                            + ' expected ' + expectedEncodingFormat.toString())
                    }

                    const actualEndianness = ${globalCode.msg!.readStringToken!}(actual, 4)
                    const expectedEndianness = ${globalCode.msg!.readStringToken!}(expected, 4)
                    if (actualEndianness !== expectedEndianness) {
                        reportTestFailure(
                            'Got SoundInfo.endianness ' + actualEndianness.toString() 
                            + ' expected ' + expectedEndianness.toString())
                    }

                    const actualExtraOptions = ${globalCode.msg!.readStringToken!}(actual, 5)
                    const expectedExtraOptions = ${globalCode.msg!.readStringToken!}(expected, 5)
                    if (actualExtraOptions !== expectedExtraOptions) {
                        reportTestFailure(
                            'Got SoundInfo.extraOptions ' + actualExtraOptions.toString() 
                            + ' expected ' + expectedExtraOptions.toString())
                    }
                `,

            ]),
        ]
    )
})
