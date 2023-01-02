import assert from 'assert'
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from '../../constants'
import { AudioSettings } from '../../types'
import { TypedArrayPointer } from '../types'
import { liftString, readTypedArray } from './core-bindings'
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
        getAscCode('core.asc', audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings)
        // prettier-ignore
         + replacePlaceholdersForTesting(
            `
                let callbackOperationId: Int = 0
                let callbackOperationStatus: fs_OperationStatus = -1
                let callbackOperationSound: FloatArray[] = []
                function someCallback(id: fs_OperationId, status: fs_OperationStatus, sound: FloatArray[]): void {
                    callbackOperationId = id
                    callbackOperationStatus = status
                    callbackOperationSound = sound
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

                export declare function fs_requestReadSoundFile (id: fs_OperationId, url: Url, info: DecodingInfo): void
                export declare function fs_requestReadSoundStream (id: fs_OperationId, url: Url, info: DecodingInfo): void
                export declare function fs_requestWriteSoundFile (id: fs_OperationId, url: Url, sound: FloatArray[], info: EncodingInfo): void
                export declare function fs_requestCloseSoundStream (id: fs_OperationId): void
                
                export {
                    x_fs_readSoundFileResponse as fs_readSoundFileResponse,
                    x_fs_writeSoundFileResponse as fs_writeSoundFileResponse,
                    x_fs_soundStreamData as fs_soundStreamData,
                    x_fs_soundStreamClose as fs_soundStreamClose,
                    x_tarray_createListOfArrays as tarray_createListOfArrays,
                    x_tarray_pushToListOfArrays as tarray_pushToListOfArrays,
                    x_tarray_getListOfArraysLength as tarray_getListOfArraysLength,
                    x_tarray_getListOfArraysElem as tarray_getListOfArraysElem,
                    x_tarray_create as tarray_create,
                }
            `,
            audioSettings
        )

    describe('read sound files', () => {
        describe('fs_readSoundFile', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation and call the callback %s', async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({ bitDepth }) + `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile('/some/url', someCallback)
                    }
                `

                const exports = {
                    ...baseExports,
                    testStartReadFile: 1
                }

                const {wasmExports, called} = await initializeCoreCodeTest(
                    {code, bitDepth, exports},
                )

                const operationId: number =
                wasmExports.testStartReadFile()
                const readCalled: Array<Array<any>> = called.get(
                    'fs_requestReadSoundFile'
                )
                assert.strictEqual(readCalled.length, 1)
                assert.strictEqual(readCalled[0].length, 3)
                assert.strictEqual(readCalled[0][0], operationId)
                assert.strictEqual(
                    liftString(wasmExports, readCalled[0][1]),
                    '/some/url'
                )
                assert.strictEqual(
                    wasmExports.testCheckOperationProcessing(
                        operationId
                    ),
                    1
                )
            })
        })

        describe('fs_readSoundFileResponse', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should register the operation success %s', async ({ bitDepth }) => {

                const code = getBaseTestCode({bitDepth}) + `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile('/some/url', someCallback)
                    }
                `

                const exports = {
                    ...baseExports,
                    testStartReadFile: 1
                }

                const {wasmExports, floatArrayType} = await initializeCoreCodeTest(
                    {code, exports, bitDepth}
                )

                // 1. Create the operation
                const operationId = wasmExports.testStartReadFile()
                assert.strictEqual(
                    wasmExports.testCallbackOperationId(),
                    0
                )

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
                assert.strictEqual(
                    wasmExports.testCallbackOperationSuccess(),
                    1
                )
                assert.strictEqual(
                    wasmExports.testCallbackOperationId(),
                    operationId
                )
                const sound = readListOfTypedArrays(
                    wasmExports,
                    bitDepth,
                    wasmExports.testCallbackOperationSound()
                )
                assert.strictEqual(
                    wasmExports.testOperationCleaned(operationId),
                    1
                )
                assert.deepStrictEqual(sound, [
                    new floatArrayType([-0.1, -0.2, -0.3]),
                    new floatArrayType([0.4, 0.5, 0.6]),
                    new floatArrayType([-0.7, -0.8, -0.9]),
                ])
            })

            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should register the operation failure %s', async ({ bitDepth }) => {
                const code = getBaseTestCode({ bitDepth }) + `
                    export function testStartReadFile (array: FloatArray): Int {
                        return fs_readSoundFile('/some/url', someCallback)
                    }
                `
                
                const exports = {
                    ...baseExports,
                    testStartReadFile: 1
                }

                const {wasmExports} = await initializeCoreCodeTest(
                    {code, exports, bitDepth},
                )

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
                assert.strictEqual(
                    wasmExports.testCallbackOperationFailed(),
                    1
                )
            })
        })
    })

    describe.skip('read sound streams', () => {
        describe('_fs_SoundBuffer', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should be able to push and pull from SoundBuffer %s', async ({ bitDepth }) => {

                // prettier-ignore
                const code = getBaseTestCode({ bitDepth }) + replacePlaceholdersForTesting(`
                    const buffer: _fs_SoundBuffer = new _fs_SoundBuffer(5)
                    const channelCount: Int = 3
                    let counter: Int = 1
                    export function testCallPullFrame(): FloatArray {
                        const frame = buffer.pullFrame()
                        const frameTypedArray = new \${FloatArray}(frame.length)
                        frameTypedArray.set(frame)
                        return frameTypedArray
                    }
                    export function testAvailableFrameCount(): Int {
                        return buffer.availableFrameCount()
                    }
                    export function testCurrentBlocksLength(): Int {
                        return buffer.blocks.length
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
                `, { bitDepth })

                const exports = {
                    ...baseExports,
                    testCallPullFrame: 1,
                    testAvailableFrameCount: 1,
                    testCurrentBlocksLength: 1,
                    testPushBlock: 1,
                }

                const {wasmExports, floatArrayType} = await initializeCoreCodeTest(
                    {code, exports, bitDepth},
                )

                let framePointer: TypedArrayPointer
                let spaceAvailable: number

                // Initially, nothing in buffer
                assert.deepStrictEqual(
                    wasmExports.testAvailableFrameCount(),
                    0
                )

                // Push a block [frames : 0 + 3 = 3]
                spaceAvailable = wasmExports.testPushBlock(3)
                assert.deepStrictEqual(
                    wasmExports.testAvailableFrameCount(),
                    3
                )
                assert.strictEqual(spaceAvailable, 2)
                assert.strictEqual(
                    wasmExports.testCurrentBlocksLength(),
                    2
                )

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
                spaceAvailable = wasmExports.testPushBlock(1)
                assert.deepStrictEqual(
                    wasmExports.testAvailableFrameCount(),
                    2
                )
                assert.strictEqual(spaceAvailable, 1)
                assert.strictEqual(
                    wasmExports.testCurrentBlocksLength(),
                    2
                )

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
                assert.strictEqual(
                    wasmExports.testCurrentBlocksLength(),
                    2
                )

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
                assert.strictEqual(
                    wasmExports.testCurrentBlocksLength(),
                    1
                )
                assert.deepStrictEqual(
                    wasmExports.testAvailableFrameCount(),
                    0
                )

                // Try to push a block to big
                assert.throws(
                    () =>
                        (spaceAvailable = wasmExports.testPushBlock(10))
                )
            })
        })

        describe('fs_readSoundStream', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation and call the callback %s', async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({ bitDepth }) + `
                    export function testStartStream (array: FloatArray): Int {
                        return fs_readSoundStream('/some/url', someCallback)
                    }
                    export function testCheckSoundBufferExists(id: fs_OperationId): boolean {
                        return _FS_SOUND_STREAM_BUFFERS.has(id)
                    }
                `

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testCheckSoundBufferExists: 1,
                }

                const {wasmExports, called} = await initializeCoreCodeTest(
                    {code, exports, bitDepth})
                
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
                assert.strictEqual(
                    wasmExports.testCheckOperationProcessing(
                        operationId
                    ),
                    1
                )
                assert.strictEqual(
                    wasmExports.testCheckSoundBufferExists(operationId),
                    1
                )
            })
        })

        describe('fs_soundStreamData', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation and call the callback %s', async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({ bitDepth }) + `
                    export function testStartStream (array: FloatArray): Int {
                        return fs_readSoundStream('/some/url', someCallback)
                    }
                    export function testBufferCurrentLength(id: fs_OperationId): Int {
                        return _FS_SOUND_STREAM_BUFFERS.get(id).currentLength
                    }
                `

                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testBufferCurrentLength: 1,
                }

                const {wasmExports, floatArrayType} = await initializeCoreCodeTest(
                    {code, exports, bitDepth},
                )

                let spaceAvailable: number = 0

                // 1. Create the operation
                const operationId = wasmExports.testStartStream()
                assert.strictEqual(
                    wasmExports.testBufferCurrentLength(operationId),
                    0
                )

                // 2. Send in some sound
                spaceAvailable = wasmExports.fs_soundStreamData(
                    operationId,
                    lowerListOfTypedArrays(wasmExports, bitDepth, [
                        new floatArrayType([-0.1, -0.2, -0.3]),
                        new floatArrayType([0.1, 0.2, 0.3]),
                    ])
                )
                assert.strictEqual(
                    wasmExports.testBufferCurrentLength(operationId),
                    3
                )
                assert.strictEqual(spaceAvailable, 44100 * 10 - 3)

                spaceAvailable = wasmExports.fs_soundStreamData(
                    operationId,
                    lowerListOfTypedArrays(wasmExports, bitDepth, [
                        new floatArrayType([0.4, 0.5, 0.6]),
                        new floatArrayType([-0.4, -0.5, -0.6]),
                    ])
                )
                assert.strictEqual(
                    wasmExports.testBufferCurrentLength(operationId),
                    6
                )
                assert.strictEqual(spaceAvailable, 44100 * 10 - 6)
            })
        })

        describe('fs_soundStreamClose', () => {
            it.each<{bitDepth: AudioSettings['bitDepth']}>([
                { bitDepth: 32 },
                { bitDepth: 64 },
            ])('should create the operation and call the callback %s', async ({ bitDepth }) => {
                // prettier-ignore
                const code = getBaseTestCode({ bitDepth }) + `
                    export function testStartStream (array: FloatArray): Int {
                        return fs_readSoundStream('/some/url', someCallback)
                    }
                    export function testBufferCurrentLength(id: fs_OperationId): Int {
                        return _FS_SOUND_STREAM_BUFFERS.get(id).currentLength
                    }
                `
                
                const exports = {
                    ...baseExports,
                    testStartStream: 1,
                    testBufferCurrentLength: 1,
                }

                const {wasmExports, floatArrayType, called} = await initializeCoreCodeTest(
                    {code, exports, bitDepth},
                )

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
                        assert.strictEqual(
                            wasmExports.testCallbackOperationId(),
                            0
                        )

                        wasmExports.fs_soundStreamClose(operationId)
                        // Test callback in host space was called
                        const closeCalled: Array<Array<any>> = called.get(
                            'fs_requestCloseSoundStream'
                        )
                        assert.strictEqual(closeCalled.length, 1)
                        assert.deepStrictEqual(closeCalled[0], [operationId])
                        // Test callback in wasm was called
                        assert.strictEqual(
                            wasmExports.testCallbackOperationId(),
                            operationId
                        )
                        // Test operation was cleaned
                        wasmExports.testOperationCleaned(operationId)
            })
        })
    })
})
