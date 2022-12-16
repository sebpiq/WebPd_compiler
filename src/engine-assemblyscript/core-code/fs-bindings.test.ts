import assert from 'assert'
import { AudioSettings } from '../../types'
import { TypedArrayPointer } from '../types'
import { liftString, readTypedArray } from './core-bindings'
import {
    lowerListOfTypedArrays,
    readListOfTypedArrays,
} from './tarray-bindings'
import {
    getAscCode,
    iterTestAudioSettings,
    replacePlaceholdersForTesting,
} from './test-helpers'

describe('fs-bindings', () => {

    const getBaseTestCode = (audioSettings: AudioSettings) => replacePlaceholdersForTesting(`
        let callbackOperationId: i32 = 0
        function someCallback(id: FileOperationId): void {
            callbackOperationId = id
        }
        export function testCallbackCalled(): FileOperationId {
            return callbackOperationId
        }

        export function testCheckOperationStatusProcessing(id: FileOperationStatus): boolean {
            return fs_checkOperationStatus(id) === _FS_OPERATION_PROCESSING
        }
        export function testCheckOperationStatusSuccess(id: FileOperationId): boolean {
            return fs_checkOperationStatus(id) === _FS_OPERATION_SUCCESS
        }
        export function testOperationCleaned(id: FileOperationId): boolean {
            return !_FS_OPERATIONS_STATUSES.has(id)
                && !_FS_OPERATIONS_SOUNDS.has(id)
                && !_FS_OPERATIONS_CALLBACKS.has(id)
                && !_FS_SOUND_STREAM_BUFFERS.has(id)
                && fs_checkOperationStatus(id) === _FS_OPERATION_UNKNOWN
        }
    `, audioSettings)

    describe('read sound files', () => {
        describe('fs_readSoundFile', () => {
            it('should create the operation and call the callback', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + `
                        export function testStartReadFile (array: TypedArray): i32 {
                            return fs_readSoundFile('/some/url', someCallback)
                        }
                    `,
                    async (wasmExports, _, called) => {
                        const operationId = wasmExports.testStartReadFile()
                        const readCalled: Array<Array<any>> = called.get('fs_requestReadSoundFile')
                        assert.strictEqual(readCalled.length, 1)
                        assert.strictEqual(readCalled[0].length, 3)
                        assert.strictEqual(
                            readCalled[0][0],
                            operationId,
                        )
                        assert.strictEqual(
                            liftString(wasmExports, readCalled[0][1]),
                            '/some/url'
                        )
                        assert.strictEqual(
                            wasmExports.testCheckOperationStatusProcessing(
                                operationId
                            ),
                            1
                        )
                    }
                )
            })
        })
    
        describe('fs_readSoundFileResponse', () => {
            it('should register the operation reponse', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + replacePlaceholdersForTesting(`
                        export function testStartReadFile (array: TypedArray): i32 {
                            return fs_readSoundFile('/some/url', someCallback)
                        }
                        export function testCheckoutSound(id: FileOperationId): TypedArray[] {
                            return fs_checkoutSoundFile(id)
                        }
                    `, audioSettings),
                    async (wasmExports, { bitDepth, floatArrayType }) => {
                        // 1. Create the operation
                        const operationId = wasmExports.testStartReadFile()
                        assert.strictEqual(wasmExports.testCallbackCalled(), 0)
    
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
                        wasmExports.fs_readSoundFileResponse(operationId, soundPointer)
                        assert.strictEqual(
                            wasmExports.testCheckOperationStatusSuccess(
                                operationId
                            ),
                            1
                        )
                        assert.strictEqual(wasmExports.testCallbackCalled(), operationId)
    
                        // 3. Check-out sound, and verify that all is cleaned
                        const soundPointerBis =
                            wasmExports.testCheckoutSound(operationId)
                        const sound = readListOfTypedArrays(
                            wasmExports,
                            bitDepth,
                            soundPointerBis
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
                    }
                )
            })
        })
    })

    describe('read sound streams', () => {
        describe('fs_SoundBuffer', () => {
            it('should be able to push and pull from SoundBuffer', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + replacePlaceholdersForTesting(`
                        const buffer: fs_SoundBuffer = new fs_SoundBuffer(5)
                        const channelCount: i32 = 3
                        let counter: i32 = 1
                        export function testCallPullFrame(): TypedArray {
                            const frame = buffer.pullFrame()
                            const frameTypedArray = new \${FloatArrayType}(frame.length)
                            frameTypedArray.set(frame)
                            return frameTypedArray
                        }
                        export function testAvailableFrameCount(): i32 {
                            return buffer.availableFrameCount()
                        }
                        export function testCurrentBlocksLength(): i32 {
                            return buffer.blocks.length
                        }
                        export function testPushBlock(size: i32): i32 {
                            const block: TypedArray[] = []
                            for (let channel = 0; channel < channelCount; channel++) {
                                const channelData: TypedArray = new \${FloatArrayType}(size)
                                block.push(channelData)
                                for (let i = 0; i < size; i++) {
                                    channelData[i] = \${FloatType}((counter + i) + 10 * (channel + 1))
                                }
                            }
                            counter += size
                            return buffer.pushBlock(block)
                        }
                    `, audioSettings),
                    async (wasmExports, { floatArrayType }) => {
                        let framePointer: TypedArrayPointer
                        let spaceAvailable: number

                        // Initially, nothing in buffer
                        assert.deepStrictEqual(wasmExports.testAvailableFrameCount(), 0)

                        // Push a block [frames : 0 + 3 = 3]
                        spaceAvailable = wasmExports.testPushBlock(3)
                        assert.deepStrictEqual(wasmExports.testAvailableFrameCount(), 3)
                        assert.strictEqual(spaceAvailable, 2)
                        assert.strictEqual(wasmExports.testCurrentBlocksLength(), 2)

                        // Read a couple of frames [frames : 3 - 2 = 1]
                        framePointer = wasmExports.testCallPullFrame()
                        assert.deepStrictEqual(
                            readTypedArray(wasmExports, floatArrayType, framePointer), 
                            new floatArrayType([11, 21, 31]),
                        )
                        framePointer = wasmExports.testCallPullFrame()
                        assert.deepStrictEqual(
                            readTypedArray(wasmExports, floatArrayType, framePointer), 
                            new floatArrayType([12, 22, 32]),
                        )

                        // Push another block [frames : 1 + 1 = 2]
                        spaceAvailable = wasmExports.testPushBlock(1)
                        assert.deepStrictEqual(wasmExports.testAvailableFrameCount(), 2)
                        assert.strictEqual(spaceAvailable, 1)
                        assert.strictEqual(wasmExports.testCurrentBlocksLength(), 2)

                        // Read a couple more frames, should provoke first block to be discarded
                        framePointer = wasmExports.testCallPullFrame()
                        assert.deepStrictEqual(
                            readTypedArray(wasmExports, floatArrayType, framePointer), 
                            new floatArrayType([13, 23, 33]),
                        )
                        assert.strictEqual(wasmExports.testCurrentBlocksLength(), 2)

                        framePointer = wasmExports.testCallPullFrame()
                        assert.deepStrictEqual(
                            readTypedArray(wasmExports, floatArrayType, framePointer), 
                            new floatArrayType([14, 24, 34]),
                        )

                        // Nothing left in buffer
                        assert.strictEqual(wasmExports.testCurrentBlocksLength(), 1)
                        assert.deepStrictEqual(wasmExports.testAvailableFrameCount(), 0)

                        // Try to push a block to big
                        assert.throws(() => spaceAvailable = wasmExports.testPushBlock(10))
                    }
                )
            })
        })

        describe('fs_readSoundStream', () => {
            it('should create the operation and call the callback', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + `
                        export function testStartStream (array: TypedArray): i32 {
                            return fs_readSoundStream('/some/url', someCallback)
                        }
                        export function testCheckSoundBufferExists(id: FileOperationId): boolean {
                            return _FS_SOUND_STREAM_BUFFERS.has(id)
                        }
                    `,
                    async (wasmExports, _, called) => {
                        const operationId = wasmExports.testStartStream()
                        const readCalled: Array<Array<any>> = called.get('fs_requestReadSoundStream')
                        assert.strictEqual(readCalled.length, 1)
                        assert.strictEqual(readCalled[0].length, 3)
                        assert.strictEqual(
                            readCalled[0][0],
                            operationId,
                        )
                        assert.strictEqual(
                            liftString(wasmExports, readCalled[0][1]),
                            '/some/url'
                        )
                        assert.strictEqual(
                            wasmExports.testCheckOperationStatusProcessing(
                                operationId
                            ),
                            1
                        )
                        assert.strictEqual(
                            wasmExports.testCheckSoundBufferExists(
                                operationId
                            ),
                            1
                        )
                    }
                )
            })
        })

        describe('fs_soundStreamData', () => {
            it('should create the operation and call the callback', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + `
                        export function testStartStream (array: TypedArray): i32 {
                            return fs_readSoundStream('/some/url', someCallback)
                        }
                        export function testBufferCurrentLength(id: FileOperationId): i32 {
                            return _FS_SOUND_STREAM_BUFFERS.get(id).currentLength
                        }
                    `,
                    async (wasmExports, {floatArrayType, bitDepth}) => {
                        let spaceAvailable: number = 0

                        // 1. Create the operation
                        const operationId = wasmExports.testStartStream()
                        assert.strictEqual(wasmExports.testBufferCurrentLength(operationId), 0)

                        // 2. Send in some sound
                        spaceAvailable = wasmExports.fs_soundStreamData(operationId, lowerListOfTypedArrays(wasmExports, bitDepth, [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.1, 0.2, 0.3]),
                        ]))
                        assert.strictEqual(wasmExports.testBufferCurrentLength(operationId), 3)
                        assert.strictEqual(spaceAvailable, 44100 * 10 - 3)

                        spaceAvailable = wasmExports.fs_soundStreamData(operationId, lowerListOfTypedArrays(wasmExports, bitDepth, [
                            new floatArrayType([0.4, 0.5, 0.6]),
                            new floatArrayType([-0.4, -0.5, -0.6]),
                        ]))
                        assert.strictEqual(wasmExports.testBufferCurrentLength(operationId), 6)
                        assert.strictEqual(spaceAvailable, 44100 * 10 - 6)
                    }
                )
            })
        })

        describe('fs_soundStreamClose', () => {
            it('should create the operation and call the callback', async () => {
                await iterTestAudioSettings(
                    // prettier-ignore
                    (audioSettings) => getBaseTestCode(audioSettings) + getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + `
                        export function testStartStream (array: TypedArray): i32 {
                            return fs_readSoundStream('/some/url', someCallback)
                        }
                        export function testBufferCurrentLength(id: FileOperationId): i32 {
                            return _FS_SOUND_STREAM_BUFFERS.get(id).currentLength
                        }
                    `,
                    async (wasmExports, {floatArrayType, bitDepth}, called) => {
                        // 1. Create the operation
                        const operationId = wasmExports.testStartStream()

                        // 2. Send in some sound
                        wasmExports.fs_soundStreamData(operationId, lowerListOfTypedArrays(wasmExports, bitDepth, [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.1, 0.2, 0.3]),
                        ]))

                        // 3. close stream
                        assert.strictEqual(called.get('fs_requestCloseSoundStream').length, 0)
                        assert.strictEqual(wasmExports.testCallbackCalled(), 0)

                        wasmExports.fs_soundStreamClose(operationId)
                        // Test callback in host space was called
                        const closeCalled: Array<Array<any>> = called.get('fs_requestCloseSoundStream')
                        assert.strictEqual(closeCalled.length, 1)
                        assert.deepStrictEqual(closeCalled[0], [operationId])
                        // Test callback in wasm was called
                        assert.strictEqual(wasmExports.testCallbackCalled(), operationId)
                        // Test operation was cleaned
                        wasmExports.testOperationCleaned(operationId)
                    }
                )
            })
        })
    })


})
