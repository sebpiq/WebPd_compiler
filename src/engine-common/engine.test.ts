import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import ts from 'typescript'
const { transpileModule } = ts
import { executeCompilation } from '../compile'
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from '../constants'
import { createEngine, makeCompilation, round } from '../test-helpers'
import {
    AccessorSpecs,
    AudioSettings,
    Code,
    Compilation,
    CompilerTarget,
    Engine,
    InletListenerSpecs,
    Message,
    NodeImplementations,
} from '../types'

const BIT_DEPTH = 64
const FloatArray = 'Float64Array'
const FloatArrayType = Float64Array

describe('Engine', () => {
    type TestEngineExportsKeys = { [name: string]: any }

    type TestEngine<ExportsKeys> = Engine & {
        [Property in keyof ExportsKeys]: any
    }

    interface EngineTestSettings<ExportsKeys extends TestEngineExportsKeys> {
        target: CompilerTarget
        testCode?: Code
        exports?: ExportsKeys
        extraCompilation?: Partial<Compilation>
    }

    const initializeEngineTest = async <
        ExportsKeys extends TestEngineExportsKeys
    >({
        target,
        testCode = '',
        exports,
        extraCompilation = {},
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
                            _,
                            { globs },
                            { audioSettings: { channelCount }, target }
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
                        isEndSink: true,
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
                    extraCompilation: {
                        graph,
                        nodeImplementations,
                        audioSettings: audioSettings,
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
                            _,
                            { globs },
                            { audioSettings: { channelCount }, target }
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
                        isEndSink: true,
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
                    extraCompilation: {
                        graph,
                        nodeImplementations,
                        audioSettings: audioSettings,
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
    })

    describe('setArray', () => {
        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])('should set the array %s', async ({ target }) => {
            const testCode: Code = `
                function testReadArray1 (index: Int): Float {
                    return ARRAYS.get('array1')[index]
                }
                function testReadArray2 (index: Int): Float {
                    return ARRAYS.get('array2')[index]
                }
                function testReadArray3 (index: Int): Float {
                    return ARRAYS.get('array3')[index]
                }
            `

            const exports = {
                testReadArray1: 1,
                testReadArray2: 1,
                testReadArray3: 1,
            }

            const engine = await initializeEngineTest({
                target,
                testCode,
                exports,
            })

            engine.setArray('array1', new Float32Array([11.1, 22.2, 33.3]))
            engine.setArray('array2', new Float64Array([44.4, 55.5]))
            engine.setArray('array3', [66.6, 77.7])

            let actual: number
            actual = engine.testReadArray1(1)
            assert.strictEqual(round(actual), 22.2)
            actual = engine.testReadArray2(0)
            assert.strictEqual(round(actual), 44.4)
            actual = engine.testReadArray3(1)
            assert.strictEqual(round(actual), 77.7)
        })
    })

    describe('accessors', () => {
        const filterPortFunctionKeys = (wasmExports: any) =>
            Object.keys(wasmExports).filter(
                (key) => key.startsWith('read_') || key.startsWith('write_')
            )

        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should create the specified accessors for signal values %s',
            async ({ target }) => {
                const testCode: Code = `
                let bla: Float = 1
                let bli: Float = 2
            `

                const accessorSpecs: AccessorSpecs = {
                    bla: { access: 'r', type: 'signal' },
                    bli: { access: 'rw', type: 'signal' },
                }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    extraCompilation: { accessorSpecs },
                })

                assert.deepStrictEqual(
                    filterPortFunctionKeys(engine.accessors).sort(),
                    ['read_bla', 'read_bli', 'write_bli'].sort()
                )

                assert.strictEqual(engine.accessors.read_bla(), 1)
                assert.strictEqual(engine.accessors.read_bli(), 2)
                engine.accessors.write_bli(666.666)
                assert.strictEqual(round(engine.accessors.read_bli()), 666.666)
            }
        )

        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should create the specified accessors for message values %s',
            async ({ target }) => {
                // prettier-ignore
                const testCode: Code = `
                let bluMessage1: Message = msg_create([ MSG_FLOAT_TOKEN, MSG_STRING_TOKEN, 4 ])
                msg_writeFloatToken(bluMessage1, 0, 111)
                msg_writeStringToken(bluMessage1, 1, 'heho')

                let bluMessage2: Message = msg_create([ MSG_FLOAT_TOKEN ])
                msg_writeFloatToken(bluMessage2, 0, 222)
                
                let blo: Message[] = [bluMessage2]
                let blu: Message[] = [bluMessage1, bluMessage2]
            `

                const accessorSpecs: AccessorSpecs = {
                    blo: { access: 'r', type: 'message' },
                    blu: { access: 'rw', type: 'message' },
                }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    extraCompilation: { accessorSpecs },
                })

                assert.deepStrictEqual(
                    filterPortFunctionKeys(engine.accessors).sort(),
                    ['read_blo', 'read_blu', 'write_blu'].sort()
                )
                assert.deepStrictEqual(engine.accessors.read_blo(), [[222]])
                assert.deepStrictEqual(engine.accessors.read_blu(), [
                    [111, 'heho'],
                    [222],
                ])
                engine.accessors.write_blu([['blabla', 'bloblo'], [333]])
                assert.deepStrictEqual(engine.accessors.read_blu(), [
                    ['blabla', 'bloblo'],
                    [333],
                ])
            }
        )
    })

    describe('fs', () => {
        describe('read sound file', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                let receivedSound: FloatArray[] = []
                function testStartReadFile (): Int {
                    return fs_readSoundFile('/some/url', fs_soundInfo(3), function(
                        id: fs_OperationId,
                        status: fs_OperationStatus,
                        sound: FloatArray[],
                    ): void {
                        receivedId = id
                        receivedStatus = status
                        receivedSound = sound
                    })
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
                    const called: Array<Array<any>> = []
                    engine.fs.onReadSoundFile = (...args: any) =>
                        called.push(args)

                    const operationId = engine.testStartReadFile()

                    assert.deepStrictEqual(called[0], [
                        operationId,
                        '/some/url',
                        [3],
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
                    return fs_openSoundReadStream('/some/url', fs_soundInfo(channelCount), function(
                        id: fs_OperationId,
                        status: fs_OperationStatus,
                    ): void {
                        receivedId = id
                        receivedStatus = status
                    })
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
                const calledOpen: Array<Array<any>> = []
                const calledClose: Array<Array<any>> = []
                engine.fs.onOpenSoundReadStream = (...args: any) =>
                    calledOpen.push(args)
                engine.fs.onCloseSoundStream = (...args: any) =>
                    calledClose.push(args)

                const operationId = engine.testStartReadStream()
                assert.deepStrictEqual(calledOpen[0], [
                    operationId,
                    '/some/url',
                    [3],
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
                    return fs_openSoundWriteStream('/some/url', fs_soundInfo(channelCount), function(
                        id: fs_OperationId,
                        status: fs_OperationStatus,
                    ): void {
                        receivedId = id
                        receivedStatus = status
                    })
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
                const calledOpen: Array<Array<any>> = []
                const calledClose: Array<Array<any>> = []
                const calledSoundStreamData: Array<Array<any>> = []
                engine.fs.onOpenSoundWriteStream = (...args: any) =>
                    calledOpen.push(args)
                engine.fs.onSoundStreamData = (...args: any) =>
                    calledSoundStreamData.push(args)
                engine.fs.onCloseSoundStream = (...args: any) =>
                    calledClose.push(args)

                const operationId = engine.testStartWriteStream()
                assert.deepStrictEqual(calledOpen[0], [
                    operationId,
                    '/some/url',
                    [3],
                ])

                // 2. Engine starts to send data blocks
                engine.testSendSoundStreamData(operationId)
                engine.testSendSoundStreamData(operationId)
                assert.strictEqual(calledSoundStreamData.length, 2)
                assert.deepStrictEqual(calledSoundStreamData, [
                    [operationId, [
                        new FloatArrayType([10, 11]),
                        new FloatArrayType([20, 21]),
                        new FloatArrayType([30, 31]),
                    ]],
                    [operationId, [
                        new FloatArrayType([12, 13]),
                        new FloatArrayType([22, 23]),
                        new FloatArrayType([32, 33]),
                    ]]
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
                        fs_soundInfo(sound.length
                    ), function(
                        id: fs_OperationId,
                        status: fs_OperationStatus,
                    ): void {
                        receivedId = id
                        receivedStatus = status
                    })
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
                    const called: Array<Array<any>> = []
                    engine.fs.onWriteSoundFile = (...args: any) =>
                        called.push(args)

                    const operationId = engine.testStartWriteFile()

                    assert.deepStrictEqual(called[0], [
                        operationId,
                        [
                            new FloatArrayType([11, 12]),
                            new FloatArrayType([21, 22]),
                            new FloatArrayType([31, 32]),
                            new FloatArrayType([41, 42]),
                        ],
                        '/some/url',
                        [4],
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

    describe('inletListeners', () => {
        it.each([
            { target: 'javascript' as CompilerTarget },
            { target: 'assemblyscript' as CompilerTarget },
        ])(
            'should create the specified inlet listeners %s',
            async ({ target }) => {
                const graph = makeGraph({
                    someNode: {
                        inlets: {
                            someInlet: { type: 'message', id: 'someInlet' },
                        },
                    },
                })

                const inletListenerSpecs: InletListenerSpecs = {
                    ['someNode']: ['someInlet'],
                }

                const accessorSpecs: AccessorSpecs = {
                    someNode_INS_someInlet: { type: 'message', access: 'r' },
                }

                const testCode: Code = `
                const someNode_INS_someInlet: Array<Message> = []

                const m1: Message = msg_create([MSG_FLOAT_TOKEN, MSG_FLOAT_TOKEN])
                msg_writeFloatToken(m1, 0, 11)
                msg_writeFloatToken(m1, 1, 22)
                const m2: Message = msg_create([MSG_STRING_TOKEN, 3])
                msg_writeStringToken(m2, 0, 'bla')

                someNode_INS_someInlet.push(m1)
                someNode_INS_someInlet.push(m2)

                function testCallInletListener(): void {
                    inletListener_someNode_someInlet()
                }
            `

                const exports = { testCallInletListener: 1 }

                const engine = await initializeEngineTest({
                    target,
                    testCode,
                    extraCompilation: {
                        inletListenerSpecs,
                        accessorSpecs,
                        graph,
                    },
                    exports,
                })

                const called: Array<Array<Message>> = []

                assert.ok(
                    engine.inletListeners.someNode.someInlet
                        .onMessages instanceof Function
                )

                engine.inletListeners.someNode.someInlet.onMessages = (
                    messages: Array<Message>
                ) => called.push(messages)

                engine.testCallInletListener()
                assert.deepStrictEqual(called, [[[11, 22], ['bla']]])
            }
        )
    })
})
