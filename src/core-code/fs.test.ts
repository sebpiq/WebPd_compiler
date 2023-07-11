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
import { buf, core, msg } from '.'
import { fsCore, fsReadSoundFile, fsReadSoundStream, fsSoundStreamCore, fsWriteSoundFile, fsWriteSoundStream } from './fs'

describe('fs', () => {
    runTestSuite(
        [
            {
                description:
                    'sound info > should be able to convert fs_SoundInfo to Message %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    const ${Var('soundInfo', 'fs_SoundInfo')} = {
                        channelCount: 2,
                        sampleRate: 48000,
                        bitDepth: 24,
                        encodingFormat: 'wave',
                        endianness: 'l',
                        extraOptions: '--blo --bli',
                    }
                    const ${Var(
                        'soundInfoMessage',
                        'Message'
                    )} = fs_soundInfoToMessage(soundInfo)
                    assert_floatsEqual(msg_readFloatToken(soundInfoMessage, 0), 2)
                    assert_floatsEqual(msg_readFloatToken(soundInfoMessage, 1), 48000)
                    assert_floatsEqual(msg_readFloatToken(soundInfoMessage, 2), 24)
                    assert_stringsEqual(msg_readStringToken(soundInfoMessage, 3), 'wave')
                    assert_stringsEqual(msg_readStringToken(soundInfoMessage, 4), 'l')
                    assert_stringsEqual(msg_readStringToken(soundInfoMessage, 5), '--blo --bli')
                `,
            },
            {
                description:
                    'fs_readSoundFile > should create the operation %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_readSoundFile(
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
                    )
            
                    assert_stringsEqual(calls[0], 'i_fs_readSoundFile')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], fs_soundInfoToMessage({
                        channelCount: 4, 
                        sampleRate: 44100, 
                        bitDepth: 32, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))
                    assert_booleansEqual(_FS_OPERATIONS_IDS.has(operationId), true)
                `,
            },

            {
                description:
                    'fs_sendReadSoundFileResponse > should register the operation success and call the callback %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_readSoundFile(
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
                    )
                    assert_integersEqual(callbackOperationId, 0)

                    // 2. Operation is done, call fs_sendReadSoundFileResponse
                    let ${Var('sound', 'FloatArray[]')} = [
                        createFloatArray(3),
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    sound[0].set([-0.1, -0.2, -0.3])
                    sound[1].set([0.4, 0.5, 0.6])
                    sound[2].set([-0.7, -0.8, -0.9])
                    x_fs_onReadSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS,
                        sound
                    )

                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_SUCCESS)
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
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_readSoundFile(
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
                    )

                    x_fs_onReadSoundFileResponse(
                        operationId,
                        FS_OPERATION_FAILURE,
                        []
                    )
                    assert_integersEqual(
                        callbackOperationId,
                        operationId
                    )
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_FAILURE)
                `,
            },

            {
                description:
                    'fs_openSoundReadStream > should create the operation %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    const ${Var('channelCount', 'Int')} = 22
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundReadStream(
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
                    )

                    assert_stringsEqual(calls[0], 'i_fs_openSoundReadStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], fs_soundInfoToMessage({
                        channelCount: 22, 
                        sampleRate: 44100, 
                        bitDepth: 32, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))

                    assert_booleansEqual(_FS_OPERATIONS_IDS.has(operationId), true)
                    assert_booleansEqual(_FS_SOUND_STREAM_BUFFERS.has(operationId), true)
                    assert_integersEqual(_FS_SOUND_STREAM_BUFFERS.get(operationId).length, channelCount)
                `,
            },

            {
                description:
                    'fs_onSoundStreamData > should push data to the buffer %s',
                codeGenerator: ({ macros: { Var, Func } }) => `
                    initializeTest()
                    let ${Var('availableFrameCount', 'Int')} = 0
                    let ${Var('data', 'FloatArray[]')} = []

                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundReadStream(
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
                    )

                    // 2. Send in some sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([-11, -22, -33])
                    data[1].set([11, 22, 33])
                    availableFrameCount = x_fs_onSoundStreamData(operationId, data)
                    assert_integersEqual(availableFrameCount, 3)

                    // 3. Send in more sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([44, 55, 66])
                    data[1].set([-44, -55, -66])
                    availableFrameCount = x_fs_onSoundStreamData(operationId, data)
                    assert_integersEqual(availableFrameCount, 6)

                    // 4. Send in more sound than the buffer can hold
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([77, 88, 99])
                    data[1].set([-77, -88, -99])
                    availableFrameCount = x_fs_onSoundStreamData(operationId, data)
                    assert_integersEqual(availableFrameCount, 9)

                    // 5. Testing buffer contents
                    function pullSample ${Func(
                        [Var('operationId', 'fs_OperationId')],
                        'Float'
                    )} {
                        return buf_pullSample(_FS_SOUND_STREAM_BUFFERS.get(operationId)[0])
                    }
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
                    'fs_closeSoundStream > should close the read stream and call the callback %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    let ${Var('data', 'FloatArray[]')} = []

                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundReadStream(
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
                    )

                    // 2. Send in some sound
                    data = [
                        createFloatArray(3),
                        createFloatArray(3),
                    ]
                    data[0].set([-0.1, -0.2, -0.3])
                    data[1].set([0.1, 0.2, 0.3])
                    x_fs_onSoundStreamData(operationId, data)

                    // 3. close stream
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'i_fs_openSoundReadStream')
                    assert_integersEqual(callbackOperationId, 0)
                    x_fs_onCloseSoundStream(operationId, FS_OPERATION_SUCCESS)
                    // Test callback in host space was called
                    assert_integersEqual(calls.length, 2)
                    assert_stringsEqual(calls[1], 'i_fs_closeSoundStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_integersEqual(status_received, FS_OPERATION_SUCCESS)
                    // Test callback in module was called
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_SUCCESS)
                    // Test operation was cleaned
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'fs_openSoundWriteStream > should create the operation %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundWriteStream(
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
                    )
        
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'i_fs_openSoundWriteStream')
                    assert_integersEqual(id_received[0], operationId)
                    assert_stringsEqual(url_received[0], '/some/url')
                    assert_soundInfoMessagesEqual(info_received[0], fs_soundInfoToMessage({
                        channelCount: 4, 
                        sampleRate: 44100, 
                        bitDepth: 24, 
                        encodingFormat: 'wave', 
                        endianness: 'b', 
                        extraOptions: ''
                    }))
                    assert_booleansEqual(_FS_OPERATIONS_IDS.has(operationId), true)
                `,
            },

            {
                description:
                    'fs_sendSoundStreamData > should push data to the buffer %s',
                codeGenerator: ({ macros: { Var, Func } }) => `
                    initializeTest()
                    let ${Var('counter', 'Float')} = 0
                    let ${Var('data', 'FloatArray[]')} = []

                    function testSendSoundStreamData ${Func(
                        [Var('counter', 'Float'), Var('id', 'fs_OperationId')],
                        'void'
                    )} {
                        const ${Var('block', 'FloatArray[]')} = [
                            createFloatArray(4),
                            createFloatArray(4),
                        ]
                        block[0][0] = 10 + 4 * counter
                        block[0][1] = 11 + 4 * counter
                        block[0][2] = 12 + 4 * counter
                        block[0][3] = 13 + 4 * counter
                        block[1][0] = 20 + 4 * counter
                        block[1][1] = 21 + 4 * counter
                        block[1][2] = 22 + 4 * counter
                        block[1][3] = 23 + 4 * counter
                        fs_sendSoundStreamData(id, block)
                    }

                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundWriteStream(
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
                    )

                    // 2. Receive some sound
                    testSendSoundStreamData(counter++, operationId)
                    testSendSoundStreamData(counter++, operationId)
                    assert_integersEqual(calls.length, 3)
                    assert_stringsEqual(calls[0], 'i_fs_openSoundWriteStream')
                    assert_stringsEqual(calls[1], 'i_fs_sendSoundStreamData')
                    assert_stringsEqual(calls[2], 'i_fs_sendSoundStreamData')

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
                    'fs_closeSoundStream > should close the write stream and call the callback %s',
                codeGenerator: ({ macros: { Var, Func } }) => `
                    initializeTest()
                    function testSendSoundStreamData ${Func(
                        [Var('id', 'fs_OperationId')],
                        'void'
                    )} {
                        const ${Var(
                            'block',
                            'FloatArray[]'
                        )} = [createFloatArray(2)]
                        fs_sendSoundStreamData(id, block)
                    }
    
                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_openSoundWriteStream(
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
                    )

                    // 2. Receive some sound
                    testSendSoundStreamData(operationId)

                    // 3. close stream
                    assert_integersEqual(calls.length, 2)
                    x_fs_onCloseSoundStream(operationId, FS_OPERATION_SUCCESS)
                    // Test callback in host space was called
                    assert_integersEqual(calls.length, 3)
                    assert_stringsEqual(calls[2], 'i_fs_closeSoundStream')
                    assert_integersEqual(id_received[2], operationId)
                    assert_integersEqual(status_received, FS_OPERATION_SUCCESS)
                    // Test callback in wasm was called
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_SUCCESS)
                    // Test operation was cleaned
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'fs_writeSoundFile > should create the operation %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()

                    const ${Var('sound', 'FloatArray[]')} = [
                        createFloatArray(4),
                        createFloatArray(4),
                        createFloatArray(4),
                    ]
                    sound[0].set([11, 12, 13, 14])
                    sound[1].set([21, 22, 23, 24])
                    sound[2].set([31, 32, 33, 34])
                
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_writeSoundFile(
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
                    )
        
                    assert_integersEqual(calls.length, 1)
                    assert_stringsEqual(calls[0], 'i_fs_writeSoundFile')
                    assert_integersEqual(id_received[0], operationId)
                    assert_floatArraysEqual(sound_received[0][0], sound[0])
                    assert_floatArraysEqual(sound_received[0][1], sound[1])
                    assert_floatArraysEqual(sound_received[0][2], sound[2])
                    assert_booleansEqual(_FS_OPERATIONS_IDS.has(operationId), true)
                `,
            },

            {
                description:
                    'fs_sendWriteSoundFileResponse > should register the operation success and call the callback %s',
                codeGenerator: ({ macros: { Var } }) => `
                    initializeTest()

                    const ${Var('sound', 'FloatArray[]')} = [
                        createFloatArray(512),
                        createFloatArray(512),
                    ]

                    // 1. Create the operation
                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_writeSoundFile(
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
                    )
                    assert_integersEqual(callbackOperationId, 0)
        
                    // 2. Operation is done, call fs_sendWriteSoundFileResponse
                    x_fs_onWriteSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
        
                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_SUCCESS)
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_operationCleaned(operationId)
                `,
            },

            {
                description:
                    'fs_sendWriteSoundFileResponse > should register the operation failure %s',
                codeGenerator: ({ macros: { Var }}) => `
                    initializeTest()

                    const ${Var('sound', 'FloatArray[]')} = [
                        createFloatArray(512),
                        createFloatArray(512),
                    ]

                    const ${Var(
                        'operationId',
                        'fs_OperationId'
                    )} = fs_writeSoundFile(
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
                    )

                    x_fs_onWriteSoundFileResponse(operationId, FS_OPERATION_FAILURE)
                    assert_integersEqual(callbackOperationId, operationId)
                    assert_integersEqual(callbackOperationStatus, FS_OPERATION_FAILURE)
                `,
            },
        ],
        [
            core,
            msg,
            buf,
            fsCore,
            fsReadSoundFile.codeGenerator,
            fsWriteSoundFile.codeGenerator,
            fsSoundStreamCore.codeGenerator,
            fsReadSoundStream.codeGenerator,
            fsWriteSoundStream.codeGenerator,
            ({ macros: { Var, Func } }) => `
            // Global test variables
            let ${Var('calls', 'Array<string>')} = []
            let ${Var('id_received', 'Array<fs_OperationId>')} = []
            let ${Var('sound_received', 'FloatArray[][]')} = []
            let ${Var('url_received', 'Array<fs_Url>')} = []
            let ${Var('info_received', 'Array<Message>')} = []
            let ${Var('status_received', 'fs_OperationStatus')} = -1
            let ${Var('callbackOperationId', 'Int')} = 0
            let ${Var('callbackOperationStatus', 'fs_OperationStatus')} = -1
            let ${Var('callbackOperationSound', 'FloatArray[]')} = []

            function initializeTest ${Func([], 'void')} {
                calls = []
                id_received = []
                sound_received = []
                url_received = []
                info_received = []
                status_received = -1

                callbackOperationId = 0
                callbackOperationStatus = -1
                callbackOperationSound = []
            }

            // Dummy import
            function i_fs_readSoundFile ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('url', 'fs_Url'),
                    Var('info', 'Message'),
                ],
                'void'
            )} {
                calls.push('i_fs_readSoundFile')
                id_received.push(id)
                url_received.push(url)
                info_received.push(info)
            }

            function i_fs_openSoundReadStream ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('url', 'fs_Url'),
                    Var('info', 'Message'),
                ],
                'void'
            )} {
                calls.push('i_fs_openSoundReadStream')
                id_received.push(id)
                url_received.push(url)
                info_received.push(info)
            }

            function i_fs_openSoundWriteStream ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('url', 'fs_Url'),
                    Var('info', 'Message'),
                ],
                'void'
            )} {
                calls.push('i_fs_openSoundWriteStream')
                id_received.push(id)
                url_received.push(url)
                info_received.push(info)
            }

            function i_fs_writeSoundFile ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('sound', 'FloatArray[]'),
                    Var('url', 'fs_Url'),
                    Var('info', 'Message'),
                ],
                'void'
            )} {
                calls.push('i_fs_writeSoundFile')
                id_received.push(id)
                sound_received.push(sound)
                url_received.push(url)
                info_received.push(info)
            }

            function i_fs_sendSoundStreamData ${Func(
                [Var('id', 'fs_OperationId'), Var('sound', 'FloatArray[]')],
                'void'
            )} {
                calls.push('i_fs_sendSoundStreamData')
                id_received.push(id)
                sound_received.push(sound)
            }

            function i_fs_closeSoundStream ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('status', 'fs_OperationStatus'),
                ],
                'void'
            )} {
                calls.push('i_fs_closeSoundStream')
                id_received.push(id)
                status_received = status
            }

            function someSoundCallback ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('status', 'fs_OperationStatus'),
                    Var('sound', 'FloatArray[]'),
                ],
                'void'
            )} {
                callbackOperationId = id
                callbackOperationStatus = status
                callbackOperationSound = sound
            }

            function someCallback ${Func(
                [
                    Var('id', 'fs_OperationId'),
                    Var('status', 'fs_OperationStatus'),
                ],
                'void'
            )} {
                callbackOperationId = id
                callbackOperationStatus = status
            }

            function assert_operationCleaned ${Func(
                [Var('id', 'fs_OperationId')],
                'void'
            )} {
                if(
                    _FS_OPERATIONS_IDS.has(id)
                    || _FS_OPERATIONS_CALLBACKS.has(id)
                    || _FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                    || _FS_SOUND_STREAM_BUFFERS.has(id)
                ) {
                    reportTestFailure('operation ' + id.toString() + ' was not cleaned properly')
                }
            }

            function assert_soundInfoMessagesEqual ${Func(
                [Var('actual', 'Message'), Var('expected', 'Message')],
                'void'
            )} {
                if (!msg_isMatching(actual, [
                    MSG_FLOAT_TOKEN, 
                    MSG_FLOAT_TOKEN, 
                    MSG_FLOAT_TOKEN, 
                    MSG_STRING_TOKEN, 
                    MSG_STRING_TOKEN, 
                    MSG_STRING_TOKEN
                ])) {
                    reportTestFailure('Unexpected sound info message shape for <actual> arg')
                }
                
                if (!msg_isMatching(expected, [
                    MSG_FLOAT_TOKEN, 
                    MSG_FLOAT_TOKEN, 
                    MSG_FLOAT_TOKEN, 
                    MSG_STRING_TOKEN, 
                    MSG_STRING_TOKEN, 
                    MSG_STRING_TOKEN
                ])) {
                    reportTestFailure('Unexpected sound info message shape for <expected> arg')
                }

                const actualChannelCount = msg_readFloatToken(actual, 0)
                const expectedChannelCount = msg_readFloatToken(expected, 0)
                if (actualChannelCount !== expectedChannelCount) {
                    reportTestFailure(
                        'Got SoundInfo.channelCount ' + actualChannelCount.toString() 
                        + ' expected ' + expectedChannelCount.toString())
                }

                const actualSampleRate = msg_readFloatToken(actual, 1)
                const expectedSampleRate = msg_readFloatToken(expected, 1)
                if (actualSampleRate !== expectedSampleRate) {
                    reportTestFailure(
                        'Got SoundInfo.sampleRate ' + actualSampleRate.toString() 
                        + ' expected ' + expectedSampleRate.toString())
                }

                const actualBitDepth = msg_readFloatToken(actual, 2)
                const expectedBitDepth = msg_readFloatToken(expected, 2)
                if (actualBitDepth !== expectedBitDepth) {
                    reportTestFailure(
                        'Got SoundInfo.bitDepth ' + actualBitDepth.toString() 
                        + ' expected ' + expectedBitDepth.toString())
                }

                const actualEncodingFormat = msg_readStringToken(actual, 3)
                const expectedEncodingFormat = msg_readStringToken(expected, 3)
                if (actualEncodingFormat !== expectedEncodingFormat) {
                    reportTestFailure(
                        'Got SoundInfo.encodingFormat ' + actualEncodingFormat.toString() 
                        + ' expected ' + expectedEncodingFormat.toString())
                }

                const actualEndianness = msg_readStringToken(actual, 4)
                const expectedEndianness = msg_readStringToken(expected, 4)
                if (actualEndianness !== expectedEndianness) {
                    reportTestFailure(
                        'Got SoundInfo.endianness ' + actualEndianness.toString() 
                        + ' expected ' + expectedEndianness.toString())
                }

                const actualExtraOptions = msg_readStringToken(actual, 5)
                const expectedExtraOptions = msg_readStringToken(expected, 5)
                if (actualExtraOptions !== expectedExtraOptions) {
                    reportTestFailure(
                        'Got SoundInfo.extraOptions ' + actualExtraOptions.toString() 
                        + ' expected ' + expectedExtraOptions.toString())
                }
            }

        `,
        ]
    )
})
