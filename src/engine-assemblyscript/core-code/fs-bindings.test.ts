import assert from 'assert'
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from '../../constants'
import { round } from '../../test-helpers'
import { AudioSettings } from '../../types'
import { TypedArrayPointer } from '../types'
import { liftString, readTypedArray } from './core-bindings'
import { liftMessage } from './msg-bindings'
import {
    lowerListOfTypedArrays,
    readListOfTypedArrays,
} from './tarray-bindings'
import {
    getAscCode,
    initializeCoreCodeTest,
    replacePlaceholdersForTesting,
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
        getAscCode('tarray.asc', audioSettings) +
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

                export declare function fs_requestReadSoundFile (id: fs_OperationId, url: Url, info: Message): void
                export declare function fs_requestReadSoundStream (id: fs_OperationId, url: Url, info: Message): void
                export declare function fs_requestWriteSoundFile (id: fs_OperationId, sound: FloatArray[], url: Url, info: Message): void
                export declare function fs_requestCloseSoundStream (id: fs_OperationId, status: fs_OperationStatus): void
                
                export {
                    x_fs_readSoundFileResponse as fs_readSoundFileResponse,
                    x_fs_writeSoundFileResponse as fs_writeSoundFileResponse,
                    x_fs_soundStreamData as fs_soundStreamData,
                    fs_soundStreamClose,
                    x_tarray_createListOfArrays as tarray_createListOfArrays,
                    x_tarray_pushToListOfArrays as tarray_pushToListOfArrays,
                    x_tarray_getListOfArraysLength as tarray_getListOfArraysLength,
                    x_tarray_getListOfArraysElem as tarray_getListOfArraysElem,
                    x_tarray_create as tarray_create,
                    x_msg_create as msg_create,
                    x_msg_createArray as msg_createArray,
                    x_msg_pushToArray as msg_pushToArray,
                    x_msg_getTokenTypes as msg_getTokenTypes,
                    msg_writeStringToken,
                    msg_writeFloatToken,
                    msg_readStringToken,
                    msg_readFloatToken,
                    MSG_FLOAT_TOKEN,
                    MSG_STRING_TOKEN,
                }
            `,
            audioSettings
        )

    describe('read sound files', () => {
        describe('fs_readSoundFile', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        export function testStartReadFile (array: FloatArray): Int {
                            return fs_readSoundFile('/some/url', fs_soundInfo(4), someSoundCallback)
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
                const readCalled: Array<Array<any>> = called.get(
                    'fs_requestReadSoundFile'
                )
                assert.strictEqual(readCalled.length, 1)
                assert.strictEqual(readCalled[0].length, 3)
                assert.deepStrictEqual(
                    [
                        readCalled[0][0],
                        liftString(wasmExports, readCalled[0][1]),
                        liftMessage(wasmExports, readCalled[0][2]),
                    ],
                    [operationId, '/some/url', [4]]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
            })
        })

        describe('fs_readSoundFileResponse', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                'should register the operation success and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile('/some/url', fs_soundInfo(3), someSoundCallback)
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

                    // 2. Operation is done, call fs_readSoundFileResponse
                    const soundPointer = lowerListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.4, 0.5, 0.6]),
                            new floatArrayType([-0.7, -0.8, -0.9]),
                        ]
                    )
                    wasmExports.fs_readSoundFileResponse(
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
                    const sound = readListOfTypedArrays(
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

            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                'should register the operation failure %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile('/some/url', fs_soundInfo(1), someSoundCallback)
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
                    wasmExports.fs_readSoundFileResponse(
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
        describe('_fs_SoundBuffer', () => {
            const getBaseTestCodeBuffers = ({
                bitDepth,
            }: Partial<AudioSettings>) =>
                getBaseTestCode({ bitDepth }) +
                replacePlaceholdersForTesting(
                    `
                    const channelCount: Int = 3
                    const buffer: _fs_SoundBuffer = new _fs_SoundBuffer(channelCount)
                    let counter: Int = 1
                    export function testCallPullFrame(): FloatArray {
                        return buffer.pullFrame()
                    }
                    export function testAvailableFrameCount(): Int {
                        return buffer.availableFrameCount()
                    }
                    export function testCurrentBlocksLength(): Int {
                        return buffer.blocks.length + i32(buffer.currentBlock[0].length !== 0)
                    }
                    export function testPushBlock(size: Int): Int {
                        const block: FloatArray[] = []
                        for (let channel = 0; channel < channelCount; channel++) {
                            const channelData: FloatArray = new \${FloatArray}(size)
                            block.push(channelData)
                            for (let i = 0; i < size; i++) {
                                channelData[i] = \${Float}((counter + i) + 10 * (channel + 1))
                            }
                        }
                        counter += size
                        return buffer.pushBlock(block)
                    }
                `,
                    { bitDepth }
                )

            const baseBufferExports = {
                ...baseExports,
                testCallPullFrame: 1,
                testAvailableFrameCount: 1,
                testCurrentBlocksLength: 1,
                testPushBlock: 1,
            }

            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                'should be able to push and pull from SoundBuffer %s',
                async ({ bitDepth }) => {
                    const code = getBaseTestCodeBuffers({ bitDepth })

                    const exports = baseBufferExports

                    const { wasmExports, floatArrayType } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    let framePointer: TypedArrayPointer

                    // Initially, nothing in buffer
                    assert.deepStrictEqual(
                        wasmExports.testAvailableFrameCount(),
                        0
                    )

                    // Push a block [frames : 0 + 3 = 3]
                    let availableFrameCount: number =
                        wasmExports.testPushBlock(3)
                    assert.deepStrictEqual(availableFrameCount, 3)
                    assert.strictEqual(wasmExports.testCurrentBlocksLength(), 1)

                    // Read a couple of frames [frames : 3 - 2 = 1]
                    framePointer = wasmExports.testCallPullFrame()
                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            framePointer
                        ),
                        new floatArrayType([11, 21, 31])
                    )
                    framePointer = wasmExports.testCallPullFrame()
                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            framePointer
                        ),
                        new floatArrayType([12, 22, 32])
                    )

                    // Push another block [frames : 1 + 1 = 2]
                    availableFrameCount = wasmExports.testPushBlock(1)
                    assert.deepStrictEqual(availableFrameCount, 2)
                    assert.strictEqual(wasmExports.testCurrentBlocksLength(), 2)

                    // Read a couple more frames, should provoke first block to be discarded
                    framePointer = wasmExports.testCallPullFrame()
                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            framePointer
                        ),
                        new floatArrayType([13, 23, 33])
                    )
                    assert.strictEqual(wasmExports.testCurrentBlocksLength(), 2)

                    framePointer = wasmExports.testCallPullFrame()
                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            framePointer
                        ),
                        new floatArrayType([14, 24, 34])
                    )

                    // Nothing left in buffer
                    assert.strictEqual(wasmExports.testCurrentBlocksLength(), 1)
                    assert.deepStrictEqual(
                        wasmExports.testAvailableFrameCount(),
                        0
                    )
                }
            )

            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                "shouldn't crash if pullFrame while no data ever pushed to buffer %s",
                async ({ bitDepth }) => {
                    const code = getBaseTestCodeBuffers({ bitDepth })

                    const exports = baseBufferExports

                    const { wasmExports, floatArrayType } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            wasmExports.testCallPullFrame()
                        ),
                        new floatArrayType(3)
                    )
                }
            )

            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                "shouldn't crash if pullFrame after all data consumed %s",
                async ({ bitDepth }) => {
                    const code = getBaseTestCodeBuffers({ bitDepth })

                    const exports = baseBufferExports

                    const { wasmExports, floatArrayType } =
                        await initializeCoreCodeTest({
                            code,
                            exports,
                            bitDepth,
                        })

                    wasmExports.testPushBlock(2),
                        wasmExports.testCallPullFrame()
                    wasmExports.testCallPullFrame()

                    assert.strictEqual(wasmExports.testAvailableFrameCount(), 0)

                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            wasmExports.testCallPullFrame()
                        ),
                        new floatArrayType(3)
                    )

                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            wasmExports.testCallPullFrame()
                        ),
                        new floatArrayType(3)
                    )

                    // Works again when pushing new block
                    assert.strictEqual(wasmExports.testPushBlock(1), 1)

                    assert.deepStrictEqual(
                        readTypedArray(
                            wasmExports,
                            floatArrayType,
                            wasmExports.testCallPullFrame()
                        ),
                        new floatArrayType([13, 23, 33])
                    )
                }
            )
        })

        describe('fs_readSoundStream', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        const channelCount: Int = 22
                        export function testStartStream (array: FloatArray): Int {
                            return fs_readSoundStream('/some/url', fs_soundInfo(channelCount), someCallback)
                        }
                        export function testCheckSoundBufferExists(id: fs_OperationId): boolean {
                            return _FS_SOUND_STREAM_BUFFERS.has(id) 
                                && _FS_SOUND_STREAM_BUFFERS.get(id).channelCount === channelCount
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
                    'fs_requestReadSoundStream'
                )
                assert.strictEqual(readCalled.length, 1)
                assert.strictEqual(readCalled[0].length, 3)
                assert.strictEqual(readCalled[0][0], operationId)
                assert.strictEqual(
                    liftString(wasmExports, readCalled[0][1]),
                    '/some/url'
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
                assert.ok(wasmExports.testCheckSoundBufferExists(operationId))
            })
        })

        describe('fs_soundStreamData', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should push data to the buffer %s', async ({ bitDepth }) => {
                const code =
                    getBaseTestCode({ bitDepth }) +
                    `
                        export function testStartStream (array: FloatArray): Int {
                            return fs_readSoundStream('/some/url', fs_soundInfo(2), someCallback)
                        }
                        export function testBufferPullFrame(id: fs_OperationId): Float {
                            return _FS_SOUND_STREAM_BUFFERS.get(id).pullFrame()[0]
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
                availableFrameCount = wasmExports.fs_soundStreamData(
                    operationId,
                    lowerListOfTypedArrays(wasmExports, bitDepth, [
                        new floatArrayType([-0.1, -0.2, -0.3]),
                        new floatArrayType([0.1, 0.2, 0.3]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 3)

                // 3. Send in more sound
                availableFrameCount = wasmExports.fs_soundStreamData(
                    operationId,
                    lowerListOfTypedArrays(wasmExports, bitDepth, [
                        new floatArrayType([0.4, 0.5, 0.6]),
                        new floatArrayType([-0.4, -0.5, -0.6]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 6)

                // 4. Send in more sound than the buffer can hold
                availableFrameCount = wasmExports.fs_soundStreamData(
                    operationId,
                    lowerListOfTypedArrays(wasmExports, bitDepth, [
                        new floatArrayType([0.7, 0.8, 0.9]),
                        new floatArrayType([-0.7, -0.8, -0.9]),
                    ])
                )
                assert.strictEqual(availableFrameCount, 9)

                // 5. Testing buffer contents
                assert.deepStrictEqual(
                    [1, 2, 3, 4, 5, 6, 7].map((_) =>
                        round(wasmExports.testBufferPullFrame())
                    ),
                    [-0.1, -0.2, -0.3, 0.4, 0.5, 0.6, 0.7]
                )
            })
        })

        describe('fs_soundStreamClose', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
                'should create the operation and call the callback %s',
                async ({ bitDepth }) => {
                    const code =
                        getBaseTestCode({ bitDepth }) +
                        `
                        export function testStartStream (array: FloatArray): Int {
                            return fs_readSoundStream('/some/url', fs_soundInfo(2), someCallback)
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
                    wasmExports.fs_soundStreamData(
                        operationId,
                        lowerListOfTypedArrays(wasmExports, bitDepth, [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.1, 0.2, 0.3]),
                        ])
                    )

                    // 3. close stream
                    assert.strictEqual(
                        called.get('fs_requestCloseSoundStream').length,
                        0
                    )
                    assert.strictEqual(wasmExports.testCallbackOperationId(), 0)

                    wasmExports.fs_soundStreamClose(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
                    // Test callback in host space was called
                    const closeCalled: Array<Array<any>> = called.get(
                        'fs_requestCloseSoundStream'
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
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation %s', async ({ bitDepth }) => {
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
                                sound, '/some/url', fs_soundInfo(sound.length), someCallback)
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
                    'fs_requestWriteSoundFile'
                )
                assert.strictEqual(writeCalled.length, 1)
                assert.strictEqual(writeCalled[0].length, 4)
                assert.deepStrictEqual(
                    [
                        writeCalled[0][0],
                        readListOfTypedArrays(
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
                        [3],
                    ]
                )
                assert.ok(wasmExports.testCheckOperationProcessing(operationId))
            })
        })

        describe('fs_writeSoundFileResponse', () => {
            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
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
                                    sound, '/some/url', fs_soundInfo(sound.length), someCallback)
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

                    // 2. Operation is done, call fs_writeSoundFileResponse
                    wasmExports.fs_writeSoundFileResponse(
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

            it.each<{ bitDepth: AudioSettings['bitDepth'] }>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])(
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
                                    sound, '/some/url', fs_soundInfo(sound.length), someCallback)
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
                    wasmExports.fs_writeSoundFileResponse(
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
