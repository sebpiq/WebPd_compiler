import assert from 'assert'
import { liftString } from './core-bindings'
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
    describe('fs_readSound', () => {
        it('should create the operation and call the callback', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + `
                    export function testCallReadSound (array: TypedArray): i32 {
                        return fs_readSound('/some/url')
                    }
                    export function testCheckOperationStatusProcessing(id: FileOperationStatus): boolean {
                        return fs_checkOperationStatus(id) === FILE_OPERATION_PROCESSING
                    }
                `,
                async (wasmExports, _, called) => {
                    const operationId = wasmExports.testCallReadSound()
                    const readCalled = called.get('fs_readSoundListener')
                    assert.strictEqual(readCalled.length, 1)
                    assert.strictEqual(readCalled[0].length, 2)
                    assert.strictEqual(
                        liftString(wasmExports, readCalled[0][0]),
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

    describe('fs_readSoundDone', () => {
        it('should create the operation and call the callback', async () => {
            await iterTestAudioSettings(
                // prettier-ignore
                (audioSettings) => getAscCode('tarray.asc', audioSettings) + getAscCode('fs.asc', audioSettings) + replacePlaceholdersForTesting(`
                    export function testCallReadSound (array: TypedArray): i32 {
                        return fs_readSound('/some/url')
                    }
                    export function testCheckOperationStatusSuccess(id: FileOperationStatus): boolean {
                        return fs_checkOperationStatus(id) === FILE_OPERATION_SUCCESS
                    }
                    export function testCheckOperationStatusUnknown(id: FileOperationStatus): boolean {
                        return fs_checkOperationStatus(id) === FILE_OPERATION_UNKNOWN 
                    }
                    export function testOperationCleaned(id: FileOperationStatus): boolean {
                        return !FILE_OPERATIONS_STATUSES.has(id)
                            && !FILE_OPERATIONS_SOUNDS.has(id)
                    }
                    export function testCheckoutSound(id: FileOperationStatus): TypedArray[] {
                        return fs_checkoutSound(id)
                    }
                `, audioSettings),
                async (wasmExports, { bitDepth, floatArrayType }) => {
                    // 1. Create the operation
                    const operationId = wasmExports.testCallReadSound()

                    // 2. Operation is done, call fs_readSoundDone
                    const soundPointer = lowerListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        [
                            new floatArrayType([-0.1, -0.2, -0.3]),
                            new floatArrayType([0.4, 0.5, 0.6]),
                            new floatArrayType([-0.7, -0.8, -0.9]),
                        ]
                    )
                    wasmExports.fs_readSoundDone(operationId, soundPointer)
                    assert.strictEqual(
                        wasmExports.testCheckOperationStatusSuccess(
                            operationId
                        ),
                        1
                    )

                    // 3. Check-out sound, and verify that all is cleaned
                    const soundPointerBis =
                        wasmExports.testCheckoutSound(operationId)
                    const sound = readListOfTypedArrays(
                        wasmExports,
                        bitDepth,
                        soundPointerBis
                    )
                    assert.strictEqual(
                        wasmExports.testCheckOperationStatusUnknown(
                            operationId
                        ),
                        1
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
