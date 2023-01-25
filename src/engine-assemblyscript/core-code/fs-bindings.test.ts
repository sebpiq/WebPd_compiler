import assert from 'assert'
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from '../../constants'
import { round } from '../../test-helpers'
import { AudioSettings, SoundFileInfo } from '../../types'
import { liftString } from './core-bindings'
import { liftMessage } from './msg-bindings'
import {
    lowerListOfFloatArrays,
    readListOfFloatArrays,
} from './farray-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    replacePlaceholdersForTesting,
    TEST_PARAMETERS,
} from './test-helpers'

describe('fs-bindings', () => {
    const baseExports = {
        testCallbackOperationId: 1,
        testCallbackOperationSuccess: 1,
        testCallbackOperationFailed: 1,
        testCallbackOperationSound: 1,
        testCheckOperationProcessing: 1,
        testOperationCleaned: 1,
    }

    const getBaseTestCode = (audioSettings: Partial<AudioSettings>) =>
        getAscCode('core.asc', audioSettings) +
        getAscCode('farray.asc', audioSettings) +
        getAscCode('buf.asc', audioSettings) +
        getAscCode('msg.asc', audioSettings) +
        getAscCode('fs.asc', audioSettings) +
        replacePlaceholdersForTesting(
            `
                let callbackOperationId: Int = 0
                let callbackOperationStatus: fs_OperationStatus = -1
                let callbackOperationSound: FloatArray[] = []
                function someSoundCallback(id: fs_OperationId, status: fs_OperationStatus, sound: FloatArray[]): void {
                    callbackOperationId = id
                    callbackOperationStatus = status
                    callbackOperationSound = sound
                }
                function someCallback(id: fs_OperationId, status: fs_OperationStatus): void {
                    callbackOperationId = id
                    callbackOperationStatus = status
                }

                export function testCallbackOperationId(): fs_OperationId {
                    return callbackOperationId
                }
                export function testCallbackOperationSuccess(): fs_OperationId {
                    return callbackOperationStatus === FS_OPERATION_SUCCESS
                }
                export function testCallbackOperationFailed(): fs_OperationId {
                    return callbackOperationStatus === FS_OPERATION_FAILURE
                }
                export function testCallbackOperationSound(): FloatArray[] {
                    return callbackOperationSound
                }
                export function testCheckOperationProcessing(id: fs_OperationStatus): boolean {
                    return _FS_OPERATIONS_IDS.has(id)
                }
                export function testOperationCleaned(id: fs_OperationId): boolean {
                    return !_FS_OPERATIONS_IDS.has(id)
                        && !_FS_OPERATIONS_CALLBACKS.has(id)
                        && !_FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                        && !_FS_SOUND_STREAM_BUFFERS.has(id)
                }

                export declare function i_fs_readSoundFile (id: fs_OperationId, url: Url, info: Message): void
                export declare function i_fs_writeSoundFile (id: fs_OperationId, sound: FloatArray[], url: Url, info: Message): void
                export declare function i_fs_openSoundReadStream (id: fs_OperationId, url: Url, info: Message): void
                export declare function i_fs_openSoundWriteStream (id: fs_OperationId, url: Url, info: Message): void
                export declare function i_fs_sendSoundStreamData (id: fs_OperationId, block: FloatArray[]): void
                export declare function i_fs_closeSoundStream (id: fs_OperationId, status: fs_OperationStatus): void

                export {
                    // FS EXPORTS
                    x_fs_onReadSoundFileResponse as fs_onReadSoundFileResponse,
                    x_fs_onWriteSoundFileResponse as fs_onWriteSoundFileResponse,
                    x_fs_onSoundStreamData as fs_onSoundStreamData,
                    x_fs_onCloseSoundStream as fs_onCloseSoundStream,
        
                    // MSG EXPORTS
                    x_msg_create as msg_create,
                    x_msg_getTokenTypes as msg_getTokenTypes,
                    x_msg_createTemplate as msg_createTemplate,
                    msg_writeStringToken,
                    msg_writeFloatToken,
                    msg_readStringToken,
                    msg_readFloatToken,
                    MSG_FLOAT_TOKEN,
                    MSG_STRING_TOKEN,
        
                    // FARRAY EXPORTS
                    x_farray_createListOfArrays as farray_createListOfArrays,
                    x_farray_pushToListOfArrays as farray_pushToListOfArrays,
                    x_farray_getListOfArraysLength as farray_getListOfArraysLength,
                    x_farray_getListOfArraysElem as farray_getListOfArraysElem,
                    farray_create,
                }
            `,
            audioSettings
        )

    describe('sound info', () => {
        it.each(TEST_PARAMETERS)(
            'should be able to convert _fs_SoundInfo to Message %s',
            async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                    export function testSoundInfoToMessage (array: FloatArray): Message {
                        const soundInfo: _fs_SoundInfo = {
                            channelCount: 2,
                            sampleRate: 48000,
                            bitDepth: 24,
                            encodingFormat: 'wave',
                            endianness: 'l',
                            extraOptions: '--blo --bli',
                        }
                        return fs_soundInfoToMessage(soundInfo)
                    }
                `

                const exports = {
                    ...baseExports,
                    testSoundInfoToMessage: 1,
                }

                const { wasmExports } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                assert.deepStrictEqual(
                    liftMessage(
                        wasmExports,
                        wasmExports.testSoundInfoToMessage()
                    ),
                    [2, 48000, 24, 'wave', 'l', '--blo --bli'] as SoundFileInfo
                )
            }
        )
    })

    describe('read sound files', () => {
        describe('fs_readSoundFile', () => {
            it.each(TEST_PARAMETERS)('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        export function testStartReadFile (array: FloatArray): Int {
                            return fs_readSoundFile(
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
                        }
                    `

                const exports = {
                    ...baseExports,
                    testStartReadFile: 1,
                }

                const { wasmExports, called } = await initializeCoreCodeTest({
                    code,
                    bitDepth,
                    exports,
                })

                const operationId: number = wasmExports.testStartReadFile()
                const readCalled: Array<Array<any>> =
                    called.get('i_fs_readSoundFile')
                assert.strictEqual(readCalled.length, 1)
                assert.strictEqual(readCalled[0].length, 3)
                assert.deepStrictEqual(
                    [
                        readCalled[0][0],
                        liftString(wasmExports, readCalled[0][1]),
                        liftMessage(wasmExports, readCalled[0][2]),
                    ],
                    [
                        operationId,
                        '/some/url',
                        [4, 44100, 32, 'wave', 'b', ''] as SoundFileInfo,
                    ]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
            })
        })

        describe('fs_sendReadSoundFileResponse', () => {
            it.each(TEST_PARAMETERS)(
                'should register the operation success and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile(
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
                    }
                `

                    const exports = {
                        ...baseExports,
                        testStartReadFile: 1,
                    }

                    const { wasmExports, floatArrayType } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    // 1. Create the operation
                    const operationId = wasmExports.testStartReadFile()
                    assert.strictEqual(wasmExports.testCallbackOperationId(), 0)

                    // 2. Operation is done, call fs_sendReadSoundFileResponse
                    const soundPointer = lowerListOfFloatArrays(
                        wasmExports,
                        bitDepth,
                        [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.4, 0.5, 0.6]),
                            new floatArrayType([-0.7, -0.8, -0.9]),
                        ]
                    )
                    wasmExports.fs_onReadSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS,
                        soundPointer
                    )

                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert.ok(wasmExports.testCallbackOperationSuccess())
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    const sound = readListOfFloatArrays(
                        wasmExports,
                        bitDepth,
                        wasmExports.testCallbackOperationSound()
                    )
                    assert.ok(wasmExports.testOperationCleaned(operationId))
                    assert.deepStrictEqual(sound, [
                        new floatArrayType([-0.1, -0.2, -0.3]),
                        new floatArrayType([0.4, 0.5, 0.6]),
                        new floatArrayType([-0.7, -0.8, -0.9]),
                    ])
                }
            )

            it.each(TEST_PARAMETERS)(
                'should register the operation failure %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile(
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
                    }
                `

                    const exports = {
                        ...baseExports,
                        testStartReadFile: 1,
                    }

                    const { wasmExports } = await initializeCoreCodeTest({
                        code,
                        exports,
                        bitDepth,
                    })

                    const operationId = wasmExports.testStartReadFile()
                    wasmExports.fs_onReadSoundFileResponse(
                        operationId,
                        FS_OPERATION_FAILURE,
                        0
                    )
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    assert.ok(wasmExports.testCallbackOperationFailed())
                }
            )
        })
    })

    describe('read sound streams', () => {

        describe('fs_openSoundReadStream', () => {
            it.each(TEST_PARAMETERS)('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        const channelCount: Int = 22
                        export function testStartStream (array: FloatArray): Int {
                            return fs_openSoundReadStream(
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
                        }
                        export function testCheckSoundBufferExists(id: fs_OperationId): boolean {
                            return _FS_SOUND_STREAM_BUFFERS.has(id) 
                                && _FS_SOUND_STREAM_BUFFERS.get(id).length === channelCount
                        }
                    `

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testCheckSoundBufferExists: 1,
                }

                const { wasmExports, called } = await initializeCoreCodeTest({
                    code,
                    exports,
                    bitDepth,
                })

                const operationId: number = wasmExports.testStartStream()
                const readCalled: Array<Array<any>> = called.get(
                    'i_fs_openSoundReadStream'
                )
                assert.strictEqual(readCalled.length, 1)
                assert.strictEqual(readCalled[0].length, 3)
                assert.deepStrictEqual(
                    [
                        readCalled[0][0],
                        liftString(wasmExports, readCalled[0][1]),
                        liftMessage(wasmExports, readCalled[0][2]),
                    ],
                    [
                        operationId,
                        '/some/url',
                        [22, 44100, 32, 'wave', 'b', ''] as SoundFileInfo,
                    ]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
                assert.ok(wasmExports.testCheckSoundBufferExists(operationId))
            })
        })

        describe('fs_onSoundStreamData', () => {
            it.each(TEST_PARAMETERS)('should push data to the buffer %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        export function testStartStream (array: FloatArray): Int {
                            return fs_openSoundReadStream(
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
                        }
                        export function testBufferPullFrame(id: fs_OperationId): Float {
                            return buf_pullSample(_FS_SOUND_STREAM_BUFFERS.get(id)[0])
                        }
                    `

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testBufferPullFrame: 1,
                }

                const { wasmExports, floatArrayType } =
                    await initializeCoreCodeTest({
                        code,
                        exports,
                        bitDepth,
                    })

                let availableFrameCount: number = 0

                // 1. Create the operation
                const operationId = wasmExports.testStartStream()

                // 2. Send in some sound
                availableFrameCount = wasmExports.fs_onSoundStreamData(
                    operationId,
                    lowerListOfFloatArrays(wasmExports, bitDepth, [
                        new floatArrayType([-0.1, -0.2, -0.3]),
                        new floatArrayType([0.1, 0.2, 0.3]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 3)

                // 3. Send in more sound
                availableFrameCount = wasmExports.fs_onSoundStreamData(
                    operationId,
                    lowerListOfFloatArrays(wasmExports, bitDepth, [
                        new floatArrayType([0.4, 0.5, 0.6]),
                        new floatArrayType([-0.4, -0.5, -0.6]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 6)

                // 4. Send in more sound than the buffer can hold
                availableFrameCount = wasmExports.fs_onSoundStreamData(
                    operationId,
                    lowerListOfFloatArrays(wasmExports, bitDepth, [
                        new floatArrayType([0.7, 0.8, 0.9]),
                        new floatArrayType([-0.7, -0.8, -0.9]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 9)

                // 5. Testing buffer contents
                assert.deepStrictEqual(
                    [1, 2, 3, 4, 5, 6, 7].map((_) =>
                        round(wasmExports.testBufferPullFrame(operationId))
                    ),
                    [-0.1, -0.2, -0.3, 0.4, 0.5, 0.6, 0.7]
                )
            })
        })

        describe('fs_closeSoundStream', () => {
            it.each(TEST_PARAMETERS)(
                'should create the operation and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                        export function testStartStream (array: FloatArray): Int {
                            return fs_openSoundReadStream(
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
                        }
                    `

                    const exports = {
                        ...baseExports,
                        testStartStream: 1,
                        testBufferCurrentLength: 1,
                    }

                    const { wasmExports, floatArrayType, called } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    // 1. Create the operation
                    const operationId = wasmExports.testStartStream()

                    // 2. Send in some sound
                    wasmExports.fs_onSoundStreamData(
                        operationId,
                        lowerListOfFloatArrays(wasmExports, bitDepth, [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.1, 0.2, 0.3]),
                        ])
                    )

                    // 3. close stream
                    assert.strictEqual(
                        called.get('i_fs_closeSoundStream').length,
                        0
                    )
                    assert.strictEqual(wasmExports.testCallbackOperationId(), 0)

                    wasmExports.fs_onCloseSoundStream(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
                    // Test callback in host space was called
                    const closeCalled: Array<Array<any>> = called.get(
                        'i_fs_closeSoundStream'
                    )
                    assert.strictEqual(closeCalled.length, 1)
                    assert.deepStrictEqual(closeCalled[0], [
                        operationId,
                        FS_OPERATION_SUCCESS,
                    ])
                    // Test callback in wasm was called
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    assert.ok(wasmExports.testCallbackOperationSuccess())
                    // Test operation was cleaned
                    assert.ok(wasmExports.testOperationCleaned(operationId))
                }
            )
        })
    })

    describe('write sound streams', () => {
        describe('fs_openSoundWriteStream', () => {
            it.each(TEST_PARAMETERS)('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        const channelCount: Int = 4
                        export function testStartStream (array: FloatArray): Int {
                            return fs_openSoundWriteStream(
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
                        }
                    `

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                }

                const { wasmExports, called } = await initializeCoreCodeTest({
                    code,
                    exports,
                    bitDepth,
                })

                const operationId: number = wasmExports.testStartStream()
                const writeCalled: Array<Array<any>> = called.get(
                    'i_fs_openSoundWriteStream'
                )
                assert.strictEqual(writeCalled.length, 1)
                assert.strictEqual(writeCalled[0].length, 3)
                assert.deepStrictEqual(
                    [
                        writeCalled[0][0],
                        liftString(wasmExports, writeCalled[0][1]),
                        liftMessage(wasmExports, writeCalled[0][2]),
                    ],
                    [
                        operationId,
                        '/some/url',
                        [2, 44100, 24, 'wave', 'b', ''] as SoundFileInfo,
                    ]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
            })
        })

        describe('fs_sendSoundStreamData', () => {
            it.each(TEST_PARAMETERS)('should push data to the buffer %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    replacePlaceholdersForTesting(
                        `
                        let counter: Float = 0
                        export function testStartStream (array: FloatArray): Int {
                            return fs_openSoundWriteStream(
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
                        }
                        export function testSendSoundStreamData(id: fs_OperationId): void {
                            const block: FloatArray[] = [
                                new \${FloatArray}(4),
                                new \${FloatArray}(4),
                            ]
                            block[0][0] = 10 + 4 * counter
                            block[0][1] = 11 + 4 * counter
                            block[0][2] = 12 + 4 * counter
                            block[0][3] = 13 + 4 * counter
                            block[1][0] = 20 + 4 * counter
                            block[1][1] = 21 + 4 * counter
                            block[1][2] = 22 + 4 * counter
                            block[1][3] = 23 + 4 * counter
                            counter++
                            fs_sendSoundStreamData(id, block)
                        }
                    `,
                        { bitDepth }
                    )

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testSendSoundStreamData: 1,
                }

                const { wasmExports, floatArrayType, called } =
                    await initializeCoreCodeTest({
                        code,
                        exports,
                        bitDepth,
                    })

                // 1. Create the operation
                const operationId = wasmExports.testStartStream()

                // 2. Receive some sound
                wasmExports.testSendSoundStreamData(operationId)
                wasmExports.testSendSoundStreamData(operationId)
                const receivedCalls = called.get('i_fs_sendSoundStreamData')
                assert.strictEqual(receivedCalls.length, 2)
                assert.strictEqual(receivedCalls[0].length, 2)
                assert.deepStrictEqual(
                    [
                        receivedCalls[0][0],
                        readListOfFloatArrays(
                            wasmExports,
                            bitDepth,
                            receivedCalls[0][1]
                        ),
                    ],
                    [
                        operationId,
                        [
                            new floatArrayType([10, 11, 12, 13]),
                            new floatArrayType([20, 21, 22, 23]),
                        ],
                    ]
                )

                assert.strictEqual(receivedCalls[1].length, 2)
                assert.deepStrictEqual(
                    [
                        receivedCalls[1][0],
                        readListOfFloatArrays(
                            wasmExports,
                            bitDepth,
                            receivedCalls[1][1]
                        ),
                    ],
                    [
                        operationId,
                        [
                            new floatArrayType([14, 15, 16, 17]),
                            new floatArrayType([24, 25, 26, 27]),
                        ],
                    ]
                )
            })
        })

        describe('fs_closeSoundStream', () => {
            it.each(TEST_PARAMETERS)(
                'should create the operation and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        replacePlaceholdersForTesting(
                            `
                            export function testStartStream (array: FloatArray): Int {
                                return fs_openSoundWriteStream(
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
                            }
                            export function testSendSoundStreamData(id: fs_OperationId): void {
                                const block: FloatArray[] = [
                                    new \${FloatArray}(2),
                                ]
                                fs_sendSoundStreamData(id, block)
                            }
                        `,
                            { bitDepth }
                        )

                    const exports = {
                        ...baseExports,
                        testStartStream: 1,
                        testSendSoundStreamData: 1,
                    }

                    const { wasmExports, called } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    // 1. Create the operation
                    const operationId = wasmExports.testStartStream()

                    // 2. Receive some sound
                    wasmExports.testSendSoundStreamData(operationId)

                    // 3. close stream
                    assert.strictEqual(
                        called.get('i_fs_closeSoundStream').length,
                        0
                    )
                    assert.strictEqual(wasmExports.testCallbackOperationId(), 0)

                    wasmExports.fs_onCloseSoundStream(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
                    // Test callback in host space was called
                    const closeCalled: Array<Array<any>> = called.get(
                        'i_fs_closeSoundStream'
                    )
                    assert.strictEqual(closeCalled.length, 1)
                    assert.deepStrictEqual(closeCalled[0], [
                        operationId,
                        FS_OPERATION_SUCCESS,
                    ])
                    // Test callback in wasm was called
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    assert.ok(wasmExports.testCallbackOperationSuccess())
                    // Test operation was cleaned
                    assert.ok(wasmExports.testOperationCleaned(operationId))
                }
            )
        })
    })

    describe('write sound files', () => {
        describe('fs_writeSoundFile', () => {
            it.each(TEST_PARAMETERS)('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    replacePlaceholdersForTesting(
                        `
                        const sound: FloatArray[] = [
                            new \${FloatArray}(4),
                            new \${FloatArray}(4),
                            new \${FloatArray}(4),
                        ]
                        sound[0][0] = 11
                        sound[0][1] = 12
                        sound[0][2] = 13
                        sound[0][3] = 14
                        sound[1][0] = 21
                        sound[1][1] = 22
                        sound[1][2] = 23
                        sound[1][3] = 24
                        sound[2][0] = 31
                        sound[2][1] = 32
                        sound[2][2] = 33
                        sound[2][3] = 34

                        export function testStartWriteFile (array: FloatArray): Int {
                            return fs_writeSoundFile(
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
                        }
                    `,
                        { bitDepth }
                    )

                const exports = {
                    ...baseExports,
                    testStartWriteFile: 1,
                }

                const { wasmExports, called, floatArrayType } =
                    await initializeCoreCodeTest({
                        code,
                        bitDepth,
                        exports,
                    })

                const operationId: number = wasmExports.testStartWriteFile()
                const writeCalled: Array<Array<any>> = called.get(
                    'i_fs_writeSoundFile'
                )
                assert.strictEqual(writeCalled.length, 1)
                assert.strictEqual(writeCalled[0].length, 4)
                assert.deepStrictEqual(
                    [
                        writeCalled[0][0],
                        readListOfFloatArrays(
                            wasmExports,
                            bitDepth,
                            writeCalled[0][1]
                        ),
                        liftString(wasmExports, writeCalled[0][2]),
                        liftMessage(wasmExports, writeCalled[0][3]),
                    ],
                    [
                        operationId,
                        [
                            new floatArrayType([11, 12, 13, 14]),
                            new floatArrayType([21, 22, 23, 24]),
                            new floatArrayType([31, 32, 33, 34]),
                        ],
                        '/some/url',
                        [3, 44100, 24, 'wave', 'b', ''] as SoundFileInfo,
                    ]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
            })
        })

        describe('fs_sendWriteSoundFileResponse', () => {
            it.each(TEST_PARAMETERS)(
                'should register the operation success and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        replacePlaceholdersForTesting(
                            `
                            const sound: FloatArray[] = [
                                new \${FloatArray}(512),
                                new \${FloatArray}(512),
                            ]
                            export function testStartWriteFile (array: FloatArray): Int {
                                return fs_writeSoundFile(
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
                            }
                        `,
                            { bitDepth }
                        )

                    const exports = {
                        ...baseExports,
                        testStartWriteFile: 1,
                    }

                    const { wasmExports } = await initializeCoreCodeTest({
                        code,
                        exports,
                        bitDepth,
                    })

                    // 1. Create the operation
                    const operationId = wasmExports.testStartWriteFile()
                    assert.strictEqual(wasmExports.testCallbackOperationId(), 0)

                    // 2. Operation is done, call fs_sendWriteSoundFileResponse
                    wasmExports.fs_onWriteSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )

                    // 3. Check-out callback was called with right args, and verify that all is cleaned
                    assert.ok(wasmExports.testCallbackOperationSuccess())
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    assert.ok(wasmExports.testOperationCleaned(operationId))
                }
            )

            it.each(TEST_PARAMETERS)(
                'should register the operation failure %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        replacePlaceholdersForTesting(
                            `
                            const sound: FloatArray[] = [
                                new \${FloatArray}(512),
                                new \${FloatArray}(512),
                            ]
                            export function testStartWriteFile (array: FloatArray): Int {
                                return fs_writeSoundFile(
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
                            }
                        `,
                            { bitDepth }
                        )

                    const exports = {
                        ...baseExports,
                        testStartWriteFile: 1,
                    }

                    const { wasmExports } = await initializeCoreCodeTest({
                        code,
                        exports,
                        bitDepth,
                    })

                    const operationId = wasmExports.testStartWriteFile()
                    wasmExports.fs_onWriteSoundFileResponse(
                        operationId,
                        FS_OPERATION_FAILURE
                    )
                    assert.strictEqual(
                        wasmExports.testCallbackOperationId(),
                        operationId
                    )
                    assert.ok(wasmExports.testCallbackOperationFailed())
                }
            )
        })
    })
})
