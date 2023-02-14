import assert from 'assert'
import { AudioSettings } from '../../types'
import {
    generateTestBindings,
    getAscCode,
    TEST_PARAMETERS,
} from './test-helpers'

describe('buf-bindings', () => {
    const EXPORTED_FUNCTIONS = {
        buf_pushBlock: 0,
        buf_pullSample: 0,
        buf_readSample: 0,
        buf_writeSample: 0,
        buf_clear: 0,
        buf_create: 0,
        testGetPullAvailableLength: 0,
    }

    const getBaseTestCode = (bitDepth: AudioSettings['bitDepth']) =>
        getAscCode('core.asc', bitDepth) +
        getAscCode('buf.asc', bitDepth) +
        `
            function testGetPullAvailableLength (buf: buf_SoundBuffer): Int {
                return buf.pullAvailableLength
            }

            export {
                // CORE EXPORTS
                createFloatArray,

                // BUF EXPORTS for testing
                buf_pushBlock,
                buf_pullSample,
                buf_readSample,
                buf_writeSample,
                buf_clear,
                buf_create,

                // TEST FUNCTIONS
                testGetPullAvailableLength,
            }
        `

    describe('push / pull mode', () => {
        it.each(TEST_PARAMETERS)(
            'should be able to push and pull from SoundBuffer %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(5)
                let availableLength: number

                availableLength = bindings.buf_pushBlock(
                    soundBuffer,
                    new floatArrayType([11, 22, 33, 44])
                )
                assert.strictEqual(availableLength, 4)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 11)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 22)
                assert.strictEqual(
                    bindings.testGetPullAvailableLength(soundBuffer),
                    2
                )

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
                assert.strictEqual(
                    bindings.testGetPullAvailableLength(soundBuffer),
                    0
                )
            }
        )

        it.each(TEST_PARAMETERS)(
            'should return 0 when pulling from empty buffer %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(5)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
            }
        )
    })

    describe('read / write mode', () => {
        it.each(TEST_PARAMETERS)(
            'should return 0 when reading from an empty buffer %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(5)
                assert.strictEqual(bindings.buf_readSample(soundBuffer), 0)
            }
        )

        it.each(TEST_PARAMETERS)(
            'should write a sample to the buffer %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(3)
                bindings.buf_writeSample(soundBuffer, 11)
                bindings.buf_writeSample(soundBuffer, 22)
                bindings.buf_writeSample(soundBuffer, 33)
                assert.strictEqual(bindings.buf_readSample(soundBuffer, 0), 33)
                assert.strictEqual(bindings.buf_readSample(soundBuffer, 1), 22)
                assert.strictEqual(bindings.buf_readSample(soundBuffer, 2), 11)
            }
        )

        it.each(TEST_PARAMETERS)(
            'should not throw an error with wrong values for read offset %s',
            async ({ bitDepth }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(3)
                bindings.buf_writeSample(soundBuffer, 11)
                bindings.buf_writeSample(soundBuffer, 22)
                bindings.buf_writeSample(soundBuffer, 33)
                assert.doesNotThrow(() =>
                    bindings.buf_readSample(soundBuffer, 4)
                )
                assert.doesNotThrow(() =>
                    bindings.buf_readSample(soundBuffer, 1000)
                )
                assert.doesNotThrow(() =>
                    bindings.buf_readSample(soundBuffer, -1345)
                )
            }
        )
    })

    describe('common', () => {
        it.each(TEST_PARAMETERS)(
            'should clear content when calling buf_clear %s',
            async ({ bitDepth, floatArrayType }) => {
                const code = getBaseTestCode(bitDepth)
                const bindings = await generateTestBindings(
                    code,
                    bitDepth,
                    EXPORTED_FUNCTIONS
                )
                const soundBuffer = bindings.buf_create(5)
                bindings.buf_pushBlock(
                    soundBuffer,
                    new floatArrayType([11, 22, 33, 44])
                )
                bindings.buf_clear(soundBuffer)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
                assert.strictEqual(bindings.buf_pullSample(soundBuffer), 0)
            }
        )
    })
})
