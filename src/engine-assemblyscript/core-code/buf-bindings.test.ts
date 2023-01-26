import assert from 'assert'
import { AudioSettings } from '../../types'
import {
    generateTestBindings,
    getAscCode,
    replacePlaceholdersForTesting,
    TEST_PARAMETERS,
} from './test-helpers'

describe('buf-bindings', () => {
    const EXPORTED_FUNCTIONS = {
        buf_pushBlock: 0,
        buf_pullSample: 0,
        testCreateSoundBuffer: 0,
        testGetPullAvailableLength: 0,
    }

    const getBaseTestCode = (audioSettings: Partial<AudioSettings>) =>
        getAscCode('core.asc', audioSettings) +
        getAscCode('farray.asc', audioSettings) +
        getAscCode('msg.asc', audioSettings) +
        getAscCode('buf.asc', audioSettings) +
        replacePlaceholdersForTesting(
            `
                function testCreateSoundBuffer (length: Int): buf_SoundBuffer {
                    return new buf_SoundBuffer(length)
                }

                function testGetPullAvailableLength (buf: buf_SoundBuffer): Int {
                    return buf.pullAvailableLength
                }

                export {
                    // FARRAY EXPORTS
                    x_farray_createListOfArrays as farray_createListOfArrays,
                    x_farray_pushToListOfArrays as farray_pushToListOfArrays,
                    x_farray_getListOfArraysLength as farray_getListOfArraysLength,
                    x_farray_getListOfArraysElem as farray_getListOfArraysElem,
                    farray_create,

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

                    // BUF EXPORTS for testing
                    buf_pushBlock,
                    buf_pullSample,

                    // TEST FUNCTIONS
                    testCreateSoundBuffer,
                    testGetPullAvailableLength,
                }
            `,
            audioSettings
        )

    describe('buf_SoundBuffer', () => {
        it.each(TEST_PARAMETERS)(
            'should be able to push and pull from SoundBuffer %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode({ bitDepth })
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.testCreateSoundBuffer(5)
                let availableLength: number

                availableLength = bindings.buf_pushBlock(
                    soundBuffer,
                    new floatArrayType([11, 22, 33, 44])
                )
                assert.strictEqual(availableLength, 4)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 11)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 22)
                assert.strictEqual(bindings.testGetPullAvailableLength(soundBuffer), 2)

                // Push another block that will span over the end, and wrap 
                // back to the beginning of the buffer
                availableLength = bindings.buf_pushBlock(
                    soundBuffer,
                    new floatArrayType([55, 66, 77])
                )
                assert.strictEqual(availableLength, 5)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 33)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 44)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 55)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 66)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 77)
                assert.strictEqual(bindings.testGetPullAvailableLength(soundBuffer), 0)
            }
        )

        it.each(TEST_PARAMETERS)(
            'should return 0 when pulling from empty SoundBuffer %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode({ bitDepth })
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.testCreateSoundBuffer(5)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
            }
        )
    })
})
