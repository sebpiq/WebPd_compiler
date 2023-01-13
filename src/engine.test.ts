import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import ts from 'typescript'
const { transpileModule } = ts
import { executeCompilation } from './compile'
import { FS_OPERATION_SUCCESS } from './constants'
import { createEngine, makeCompilation, round } from './test-helpers'
import {
    AudioSettings,
    Code,
    Compilation,
    CompilerTarget,
    Engine,
    OutletListenerSpecs,
    Message,
    NodeImplementations,
    InletCallerSpecs,
    SoundFileInfo,
} from './types'

const BIT_DEPTH = 64
const FloatArray = 'Float64Array'
const floatArrayType = Float64Array

describe('Engine', () => {
    type TestEngineExportsKeys = { [name: string]: any }

    type TestEngine<ExportsKeys> = Engine & {
        [Property in keyof ExportsKeys]: any
    }

    interface EngineTestSettings<ExportsKeys extends TestEngineExportsKeys> {
        target: CompilerTarget
        testCode?: Code
        exports?: ExportsKeys
        compilation?: Partial<Compilation>
    }

    const initializeEngineTest = async <
        ExportsKeys extends TestEngineExportsKeys
    >({
        target,
        testCode = '',
        exports,
        compilation: extraCompilation = {},
    }: EngineTestSettings<ExportsKeys>) => {
        const transpilationSettings = {}
        const compilation = makeCompilation({
            target,
            audioSettings: {
                channelCount: { in: 2, out: 2 },
                bitDepth: BIT_DEPTH,
            },
            ...extraCompilation,
        })

        // Transpile ASC test code to JS code
        let transpiledTestCode = testCode
        if (target === 'javascript') {
            const result = transpileModule(testCode, transpilationSettings)
            transpiledTestCode = result.outputText
        }

        let code = executeCompilation(compilation) + transpiledTestCode

        // Generate export statement for test functions
        const exportKeys = Object.keys(exports || {}) as Array<
            keyof ExportsKeys
        >
        if (target === 'javascript') {
            code += exportKeys.length
                ? `
                {${exportKeys
                    .map(
                        (name) =>
                            `exports.${name.toString()} = ${name.toString()}`
                    )
                    .join('\n')}}
            `
                : ''
        } else {
            code += `
                export {${exportKeys.join(', ')}}
            `
        }

        const engine = (await createEngine(
            target,
            code
        )) as TestEngine<ExportsKeys>

        // For asc engine, we need to expose exported test functions on the engine.
        if (target === 'assemblyscript') {
            exportKeys.forEach((name) => {
                engine[name] = (engine as any).wasmExports[name]
            })
        }

        return engine
    }

    describe('configure/loop', () => {
        it.each([
            {
                target: 'javascript' as CompilerTarget,
                outputChannels: 2,
                blockSize: 4,
            },
            {
                target: 'javascript' as CompilerTarget,
                outputChannels: 3,
                blockSize: 5,
            },
            {
                target: 'assemblyscript' as CompilerTarget,
                outputChannels: 2,
                blockSize: 4,
            },
            {
                target: 'assemblyscript' as CompilerTarget,
                outputChannels: 3,
                blockSize: 5,
            },
        ])(
            'should configure and return an output block of the right size %s',
            async ({ target, outputChannels, blockSize }) => {
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        loop: (
                            { globs, compilation: { audioSettings: { channelCount }, target } }
                        ) =>
                            target === 'assemblyscript'
                                ? `
                        for (let channel: Int = 0; channel < ${channelCount.out}; channel++) {
                            ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] = 2.0
                        }
                    `
                                : `
                        for (let channel = 0; channel < ${channelCount.out}; channel++) {
                            ${globs.output}[channel][${globs.iterFrame}] = 2.0
                        }
                    `,
                    },
                }

                const graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isSignalSink: true,
                    },
                })

                const input: Array<Float32Array> = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]

                const audioSettings: AudioSettings = {
                    bitDepth: 32,
                    channelCount: { in: 2, out: outputChannels },
                }

                const engine = await initializeEngineTest({
                    target,
                    compilation: {
                        graph,
                        nodeImplementations,
                        audioSettings,
                    },
                })

                const output: Array<Float32Array> = []
                for (let channel = 0; channel < outputChannels; channel++) {
                    output.push(new Float32Array(blockSize))
                }

                const expected: Array<Float32Array> = []
                for (let channel = 0; channel < outputChannels; channel++) {
                    expected.push(new Float32Array(blockSize).fill(2))
                }

                engine.configure(44100, blockSize)
                engine.loop(input, output)
                assert.deepStrictEqual(output, expected)
            }
        )

        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should take input block and pass it to the loop %s',
            async ({ target }) => {
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        loop: (
                            { globs, compilation: { audioSettings: { channelCount }, target } }                            
                        ) =>
                            target === 'assemblyscript'
                                ? `
                        for (let channel: Int = 0; channel < ${channelCount.in}; channel++) {
                            ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] 
                                = ${globs.input}[${globs.iterFrame} + ${globs.blockSize} * channel]
                        }
                    `
                                : `
                        for (let channel = 0; channel < ${channelCount.in}; channel++) {
                            ${globs.output}[channel][${globs.iterFrame}] 
                                = ${globs.input}[channel][${globs.iterFrame}]
                        }
                    `,
                    },
                }

                const graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isSignalSink: true,
                    },
                })

                const audioSettings: AudioSettings = {
                    bitDepth: 32,
                    channelCount: { in: 2, out: 3 },
                }

                const blockSize = 4

                const input: Array<Float32Array> = [
                    new Float32Array([2, 4, 6, 8]),
                    new Float32Array([1, 3, 5, 7]),
                ]
                const output: Array<Float32Array> = [
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                    new Float32Array(blockSize),
                ]

                const engine = await initializeEngineTest({
                    target,
                    compilation: {
                        graph,
                        nodeImplementations,
                        audioSettings,
                    },
                })

                engine.configure(44100, blockSize)
                engine.loop(input, output)
                assert.deepStrictEqual(output, [
                    new Float32Array([2, 4, 6, 8]),
                    new Float32Array([1, 3, 5, 7]),
                    new Float32Array([0, 0, 0, 0]),
                ])
            }
        )

        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should export metadata audio settings and update it after configure %s',
            async ({ target }) => {
                const graph = makeGraph({
                    bla: {
                        inlets: { blo: { type: 'message', id: 'blo' } },
                        isMessageSource: true,
                    },
                    bli: {
                        outlets: { blu: { type: 'message', id: 'blu' } },
                    },
                })

                const nodeImplementations = {
                    DUMMY: {
                        messages: () => ({ blo: '' }),
                    },
                }

                const audioSettings: AudioSettings = {
                    bitDepth: 32,
                    channelCount: { in: 2, out: 3 },
                }

                const engine = await initializeEngineTest({
                    target,
                    compilation: {
                        graph,
                        nodeImplementations,
                        audioSettings,
                        inletCallerSpecs: { bla: ['blo'] },
                        outletListenerSpecs: { bli: ['blu'] },
                    },
                })

                assert.deepStrictEqual(engine.metadata, {
                    audioSettings: {
                        ...audioSettings,
                        blockSize: 0,
                        sampleRate: 0,
                    },
                    compilation: {
                        inletCallerSpecs: { bla: ['blo'] },
                        outletListenerSpecs: { bli: ['blu'] },
                        codeVariableNames:
                            engine.metadata.compilation.codeVariableNames,
                    },
                })
                assert.ok(
                    Object.keys(engine.metadata.compilation.codeVariableNames)
                        .length
                )

                engine.configure(44100, 1024)

                assert.strictEqual(
                    engine.metadata.audioSettings.blockSize,
                    1024
                )
                assert.strictEqual(
                    engine.metadata.audioSettings.sampleRate,
                    44100
                )
            }
        )
    })

    describe('tarray', () => {
        describe('get', () => {
            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])('should set the array %s', async ({ target }) => {
                const testCode: Code = `
                    const array = new ${FloatArray}(4)
                    array[0] = 123
                    array[1] = 456
                    array[2] = 789
                    array[3] = 234
                    _tarray_ARRAYS.set('array1', array)
                `

                const exports = {}

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    exports,
                })

                assert.deepStrictEqual(
                    engine.tarray.get('array1'),
                    new floatArrayType([123, 456, 789, 234])
                )
            })
        })

        describe('set', () => {
            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])('should set the array %s', async ({ target }) => {
                const testCode: Code = `
                    function testReadArray1 (index: Int): Float {
                        return _tarray_ARRAYS.get('array1')[index]
                    }
                    function testReadArray2 (index: Int): Float {
                        return _tarray_ARRAYS.get('array2')[index]
                    }
                    function testReadArray3 (index: Int): Float {
                        return _tarray_ARRAYS.get('array3')[index]
                    }
                    function testIsFloatArray (index: Int): void {
                        return _tarray_ARRAYS.get('array3').set([111, 222])
                    }
                `

                const exports = {
                    testReadArray1: 1,
                    testReadArray2: 1,
                    testReadArray3: 1,
                    testIsFloatArray: 1,
                }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    exports,
                })

                engine.tarray.set(
                    'array1',
                    new Float32Array([11.1, 22.2, 33.3])
                )
                engine.tarray.set('array2', new Float64Array([44.4, 55.5]))
                engine.tarray.set('array3', [66.6, 77.7])

                let actual: number
                actual = engine.testReadArray1(1)
                assert.strictEqual(round(actual), 22.2)
                actual = engine.testReadArray2(0)
                assert.strictEqual(round(actual), 44.4)
                actual = engine.testReadArray3(1)
                assert.strictEqual(round(actual), 77.7)
                assert.doesNotThrow(() => engine.testIsFloatArray())
            })
        })
    })

    describe('fs', () => {
        describe('read sound file', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                let receivedSound: FloatArray[] = []
                function testStartReadFile (): Int {
                    return fs_readSoundFile(
                        '/some/url', 
                        {
                            channelCount: 3,
                            sampleRate: 48000, 
                            bitDepth: 64, 
                            encodingFormat: 'aiff', 
                            endianness: 'l',
                            extraOptions: '',
                        }, function(
                            id: fs_OperationId,
                            status: fs_OperationStatus,
                            sound: FloatArray[],
                        ): void {
                            receivedId = id
                            receivedStatus = status
                            receivedSound = sound
                        }
                    )
                }
                function testOperationId(): Int {
                    return receivedId
                }
                function testOperationStatus(): Int {
                    return receivedStatus
                }
                function testSoundLength(): Int {
                    return receivedSound.length
                }
                function testOperationCleaned (id: fs_OperationId): boolean {
                    return !_FS_OPERATIONS_IDS.has(id)
                        && !_FS_OPERATIONS_CALLBACKS.has(id)
                        && !_FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                        && !_FS_SOUND_STREAM_BUFFERS.has(id)
                }
            `

            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])(
                'should register the operation success %s',
                async ({ target }) => {
                    const testCode: Code =
                        sharedTestingCode +
                        `
                    function testReceivedSound(): boolean {
                        return receivedSound[0][0] === -1
                            && receivedSound[0][1] === -2
                            && receivedSound[0][2] === -3
                            && receivedSound[1][0] === 4
                            && receivedSound[1][1] === 5
                            && receivedSound[1][2] === 6
                            && receivedSound[2][0] === -7
                            && receivedSound[2][1] === -8
                            && receivedSound[2][2] === -9
                    }
                `

                    const exports = {
                        testStartReadFile: 1,
                        testOperationId: 1,
                        testOperationStatus: 1,
                        testSoundLength: 1,
                        testReceivedSound: 1,
                        testOperationCleaned: 1,
                    }

                    const engine = await initializeEngineTest({
                        target,
                        testCode,
                        exports,
                    })

                    // 1. Some function in the engine requests a read file operation.
                    // Request is sent to host via callback
                    const called: Array<
                        Parameters<Engine['fs']['onReadSoundFile']>
                    > = []
                    engine.fs.onReadSoundFile = (...args) => called.push(args)

                    const operationId = engine.testStartReadFile()

                    assert.deepStrictEqual(called[0], [
                        operationId,
                        '/some/url',
                        [3, 48000, 64, 'aiff', 'l', ''] as SoundFileInfo,
                    ])

                    // 2. Hosts handles the operation. It then calls fs_sendReadSoundFileResponse when done.
                    engine.fs.sendReadSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS,
                        [
                            new Float32Array([-1, -2, -3]),
                            new Float32Array([4, 5, 6]),
                            new Float32Array([-7, -8, -9]),
                        ]
                    )

                    // 3. Engine-side the request initiator gets notified via callback
                    assert.strictEqual(engine.testOperationId(), operationId)
                    assert.strictEqual(
                        engine.testOperationStatus(),
                        FS_OPERATION_SUCCESS
                    )
                    assert.strictEqual(engine.testSoundLength(), 3)
                    assert.ok(engine.testReceivedSound())
                    assert.ok(engine.testOperationCleaned(operationId))
                }
            )
        })

        describe('read sound stream', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                const channelCount: Int = 3
                function testStartReadStream (array: FloatArray): Int {
                    return fs_openSoundReadStream(
                        '/some/url', 
                        {
                            channelCount: channelCount,
                            sampleRate: 48000, 
                            bitDepth: 32, 
                            encodingFormat: 'next', 
                            endianness: 'l',
                            extraOptions: '--some 8 --options'
                        }, 
                        function(
                            id: fs_OperationId,
                            status: fs_OperationStatus,
                        ): void {
                            receivedId = id
                            receivedStatus = status
                        }
                    )
                }
                function testOperationId(): Int {
                    return receivedId
                }
                function testOperationStatus(): Int {
                    return receivedStatus
                }
                function testOperationChannelCount(id: fs_OperationId): Float {
                    return _FS_SOUND_STREAM_BUFFERS.get(id).channelCount
                }
                function testOperationCleaned (id: fs_OperationId): boolean {
                    return !_FS_OPERATIONS_IDS.has(id)
                        && !_FS_OPERATIONS_CALLBACKS.has(id)
                        && !_FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                        && !_FS_SOUND_STREAM_BUFFERS.has(id)
                }
            `

            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])('should stream data in %s', async ({ target }) => {
                const testCode: Code =
                    sharedTestingCode +
                    `
                        function testReceivedSound(id: fs_OperationId): boolean {
                            const buffer = _FS_SOUND_STREAM_BUFFERS.get(id)
                            return buffer.pullFrame()[0] === -1
                                && buffer.pullFrame()[0] === -2
                                && buffer.pullFrame()[0] === -3
                        }
                    `

                const exports = {
                    testStartReadStream: 1,
                    testOperationId: 1,
                    testOperationStatus: 1,
                    testReceivedSound: 1,
                    testOperationCleaned: 1,
                    testOperationChannelCount: 1,
                }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    exports,
                })

                // 1. Some function in the engine requests a read stream operation.
                // Request is sent to host via callback
                const calledOpen: Array<
                    Parameters<Engine['fs']['onOpenSoundReadStream']>
                > = []
                const calledClose: Array<
                    Parameters<Engine['fs']['onCloseSoundStream']>
                > = []
                engine.fs.onOpenSoundReadStream = (...args) =>
                    calledOpen.push(args)
                engine.fs.onCloseSoundStream = (...args) =>
                    calledClose.push(args)

                const operationId = engine.testStartReadStream()
                assert.deepStrictEqual(calledOpen[0], [
                    operationId,
                    '/some/url',
                    [
                        3,
                        48000,
                        32,
                        'next',
                        'l',
                        '--some 8 --options',
                    ] as SoundFileInfo,
                ])
                assert.strictEqual(
                    engine.testOperationChannelCount(operationId),
                    3
                )

                // 2. Hosts handles the operation. It then calls fs_sendSoundStreamData to send in data.
                const writtenFrameCount = engine.fs.sendSoundStreamData(
                    operationId,
                    [
                        new Float32Array([-1, -2, -3]),
                        new Float32Array([4, 5, 6]),
                        new Float32Array([-7, -8, -9]),
                    ]
                )
                assert.strictEqual(writtenFrameCount, 3)
                assert.ok(engine.testReceivedSound(operationId))

                // 3. The stream is closed
                engine.fs.closeSoundStream(operationId, FS_OPERATION_SUCCESS)
                assert.ok(engine.testOperationCleaned(operationId))
                // Test host callback was called
                assert.deepStrictEqual(calledClose[0].slice(0, 2), [
                    operationId,
                    FS_OPERATION_SUCCESS,
                ])
                // Test engine callback was called
                assert.strictEqual(engine.testOperationId(), operationId)
                assert.strictEqual(
                    engine.testOperationStatus(),
                    FS_OPERATION_SUCCESS
                )
            })
        })

        describe('write sound stream', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                const channelCount: Int = 3
                const blockSize: Int = 2
                let counter: Float = 0
                function testStartWriteStream (): Int {
                    return fs_openSoundWriteStream(
                        '/some/url', 
                        {
                            channelCount: channelCount,
                            sampleRate: 44100, 
                            bitDepth: 24, 
                            encodingFormat: 'aiff', 
                            endianness: 'b',
                            extraOptions: '--bla',
                        }, 
                        function(
                            id: fs_OperationId,
                            status: fs_OperationStatus,
                        ): void {
                            receivedId = id
                            receivedStatus = status
                        }
                    )
                }
                function testSendSoundStreamData(id: fs_OperationId): void {
                    const block: FloatArray[] = [
                        new ${FloatArray}(blockSize),
                        new ${FloatArray}(blockSize),
                        new ${FloatArray}(blockSize),
                    ]
                    block[0][0] = 10 + blockSize * counter
                    block[0][1] = 11 + blockSize * counter

                    block[1][0] = 20 + blockSize * counter
                    block[1][1] = 21 + blockSize * counter

                    block[2][0] = 30 + blockSize * counter
                    block[2][1] = 31 + blockSize * counter

                    counter++
                    fs_sendSoundStreamData(id, block)
                }
                function testOperationId(): Int {
                    return receivedId
                }
                function testOperationStatus(): Int {
                    return receivedStatus
                }
                function testOperationCleaned (id: fs_OperationId): boolean {
                    return !_FS_OPERATIONS_IDS.has(id)
                        && !_FS_OPERATIONS_CALLBACKS.has(id)
                        && !_FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                        && !_FS_SOUND_STREAM_BUFFERS.has(id)
                }
            `

            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])('should stream data in %s', async ({ target }) => {
                const testCode: Code = sharedTestingCode

                const exports = {
                    testStartWriteStream: 1,
                    testOperationId: 1,
                    testOperationStatus: 1,
                    testSendSoundStreamData: 1,
                    testOperationCleaned: 1,
                }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    exports,
                })

                // 1. Some function in the engine requests a write stream operation.
                // Request is sent to host via callback
                const calledOpen: Array<
                    Parameters<Engine['fs']['onOpenSoundWriteStream']>
                > = []
                const calledClose: Array<
                    Parameters<Engine['fs']['onCloseSoundStream']>
                > = []
                const calledSoundStreamData: Array<
                    Parameters<Engine['fs']['onSoundStreamData']>
                > = []
                engine.fs.onOpenSoundWriteStream = (...args) =>
                    calledOpen.push(args)
                engine.fs.onSoundStreamData = (...args) =>
                    calledSoundStreamData.push(args)
                engine.fs.onCloseSoundStream = (...args) =>
                    calledClose.push(args)

                const operationId = engine.testStartWriteStream()
                assert.deepStrictEqual(calledOpen[0], [
                    operationId,
                    '/some/url',
                    [3, 44100, 24, 'aiff', 'b', '--bla'] as SoundFileInfo,
                ])

                // 2. Engine starts to send data blocks
                engine.testSendSoundStreamData(operationId)
                engine.testSendSoundStreamData(operationId)
                assert.strictEqual(calledSoundStreamData.length, 2)
                assert.deepStrictEqual(calledSoundStreamData, [
                    [
                        operationId,
                        [
                            new floatArrayType([10, 11]),
                            new floatArrayType([20, 21]),
                            new floatArrayType([30, 31]),
                        ],
                    ],
                    [
                        operationId,
                        [
                            new floatArrayType([12, 13]),
                            new floatArrayType([22, 23]),
                            new floatArrayType([32, 33]),
                        ],
                    ],
                ])

                // 3. The stream is closed
                engine.fs.closeSoundStream(operationId, FS_OPERATION_SUCCESS)
                assert.ok(engine.testOperationCleaned(operationId))
                // Test host callback was called
                assert.deepStrictEqual(calledClose[0].slice(0, 2), [
                    operationId,
                    FS_OPERATION_SUCCESS,
                ])
                // Test engine callback was called
                assert.strictEqual(engine.testOperationId(), operationId)
                assert.strictEqual(
                    engine.testOperationStatus(),
                    FS_OPERATION_SUCCESS
                )
            })
        })

        describe('write sound file', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                const sound: FloatArray[] = [
                    new ${FloatArray}(2),
                    new ${FloatArray}(2),
                    new ${FloatArray}(2),
                    new ${FloatArray}(2),
                ]
                sound[0][0] = 11
                sound[0][1] = 12
                sound[1][0] = 21
                sound[1][1] = 22
                sound[2][0] = 31
                sound[2][1] = 32
                sound[3][0] = 41
                sound[3][1] = 42

                function testStartWriteFile (): Int {
                    return fs_writeSoundFile(
                        sound, 
                        '/some/url', 
                        {
                            channelCount: sound.length,
                            sampleRate: 44100, 
                            bitDepth: 24, 
                            encodingFormat: 'wave', 
                            endianness: 'l',
                            extraOptions: '',
                        }, function(
                            id: fs_OperationId,
                            status: fs_OperationStatus,
                        ): void {
                            receivedId = id
                            receivedStatus = status
                        }
                    )
                }
                function testOperationId(): Int {
                    return receivedId
                }
                function testOperationStatus(): Int {
                    return receivedStatus
                }
                function testOperationCleaned (id: fs_OperationId): boolean {
                    return !_FS_OPERATIONS_IDS.has(id)
                        && !_FS_OPERATIONS_CALLBACKS.has(id)
                        && !_FS_OPERATIONS_SOUND_CALLBACKS.has(id)
                        && !_FS_SOUND_STREAM_BUFFERS.has(id)
                }
            `

            it.each([
                { target: 'javascript' as CompilerTarget },
                { target: 'assemblyscript' as CompilerTarget },
            ])(
                'should register the operation success %s',
                async ({ target }) => {
                    const testCode: Code = sharedTestingCode

                    const exports = {
                        testStartWriteFile: 1,
                        testOperationId: 1,
                        testOperationStatus: 1,
                        testOperationCleaned: 1,
                    }

                    const engine = await initializeEngineTest({
                        target,
                        testCode,
                        exports,
                    })

                    // 1. Some function in the engine requests a write file operation.
                    // Request is sent to host via callback
                    const called: Array<
                        Parameters<Engine['fs']['onWriteSoundFile']>
                    > = []
                    engine.fs.onWriteSoundFile = (...args) => called.push(args)

                    const operationId = engine.testStartWriteFile()

                    assert.deepStrictEqual(called[0], [
                        operationId,
                        [
                            new floatArrayType([11, 12]),
                            new floatArrayType([21, 22]),
                            new floatArrayType([31, 32]),
                            new floatArrayType([41, 42]),
                        ],
                        '/some/url',
                        [4, 44100, 24, 'wave', 'l', ''] as SoundFileInfo,
                    ])

                    // 2. Hosts handles the operation. It then calls fs_sendWriteSoundFileResponse when done.
                    engine.fs.sendWriteSoundFileResponse(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )

                    // 3. Engine-side the request initiator gets notified via callback
                    assert.strictEqual(engine.testOperationId(), operationId)
                    assert.strictEqual(
                        engine.testOperationStatus(),
                        FS_OPERATION_SUCCESS
                    )
                    assert.ok(engine.testOperationCleaned(operationId))
                }
            )
        })
    })

    describe('outletListeners', () => {
        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should create the specified outlet listeners %s',
            async ({ target }) => {
                // We only test that the outlet listeners are created and that calling them works.
                // We don't need to actually compile any node
                const graph = makeGraph({
                    someNode: {
                        outlets: {
                            someOutlet: { type: 'message', id: 'someOutlet' },
                        },
                    },
                })

                const outletListenerSpecs: OutletListenerSpecs = {
                    ['someNode']: ['someOutlet'],
                }

                const testCode: Code = `
                    const m1: Message = msg_create([MSG_FLOAT_TOKEN, MSG_FLOAT_TOKEN])
                    msg_writeFloatToken(m1, 0, 11)
                    msg_writeFloatToken(m1, 1, 22)
                    const m2: Message = msg_create([MSG_STRING_TOKEN, 3])
                    msg_writeStringToken(m2, 0, 'bla')

                    function testCallOutletListener(): void {
                        outletListener_someNode_someOutlet(m1)
                        outletListener_someNode_someOutlet(m2)
                    }
                `

                const exports = { testCallOutletListener: 1 }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    compilation: {
                        outletListenerSpecs,
                        graph,
                    },
                    exports,
                })

                const called: Array<Message> = []

                assert.ok(
                    engine.outletListeners.someNode.someOutlet
                        .onMessage instanceof Function
                )

                engine.outletListeners.someNode.someOutlet.onMessage = (
                    message: Message
                ) => called.push(message)

                engine.testCallOutletListener()
                assert.deepStrictEqual(called, [[11, 22], ['bla']])
            }
        )
    })

    describe('inletCallers', () => {
        it.each([
            { target: 'javascript' as CompilerTarget },
            // { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should create the specified inlet callers %s',
            async ({ target }) => {
                const graph = makeGraph({
                    someNode: {
                        type: 'someNodeType',
                        inlets: {
                            someInlet: { type: 'message', id: 'someInlet' },
                        },
                        isSignalSink: true,
                    },
                })

                const inletCallerSpecs: InletCallerSpecs = {
                    someNode: ['someInlet'],
                }

                const nodeImplementations: NodeImplementations = {
                    someNodeType: {
                        messages: ({ globs }) => ({
                            someInlet: `messageReceived = ${globs.m}`,
                        }),
                    },
                }

                const testCode: Code = `
                    const messageReceived: Message = msg_create([])

                    function testMessageReceived(): boolean {
                        return msg_getLength(messageReceived) === 2
                            && msg_isFloatToken(messageReceived, 0)
                            && msg_isStringToken(messageReceived, 1)
                            && msg_readFloatToken(messageReceived, 0) === 666
                            && msg_readStringToken(messageReceived, 1) === '🔥👿🔥'
                    }
                `

                const exports = { testMessageReceived: 1 }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    compilation: {
                        inletCallerSpecs,
                        graph,
                        nodeImplementations,
                    },
                    exports,
                })

                assert.ok(
                    engine.inletCallers.someNode.someInlet instanceof Function
                )

                assert.ok(!engine.testMessageReceived())
                engine.inletCallers.someNode.someInlet([666, '🔥👿🔥'])
                assert.ok(engine.testMessageReceived())
            }
        )
    })
})
