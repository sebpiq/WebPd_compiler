import { makeGraph } from "@webpd/dsp-graph/src/test-helpers"
import assert from "assert"
import ts from 'typescript'
const { transpileModule } = ts
import { executeCompilation } from "../compile"
import { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from "../constants"
import { createEngine, makeCompilation, round } from "../test-helpers"
import { AccessorSpecs, AudioSettings, Code, Compilation, CompilerTarget, Engine, InletListenerSpecs, Message, NodeImplementations } from "../types"

describe('Engine', () => {

    type TestEngineExportsKeys = {[name: string]: any}

    type TestEngine<ExportsKeys> = Engine & {
        [Property in keyof ExportsKeys]: any;
    }

    interface EngineTestSettings<ExportsKeys extends TestEngineExportsKeys> {
        target: CompilerTarget
        testCode?: Code
        exports?: ExportsKeys
        extraCompilation?: Partial<Compilation>
    }

    const initializeEngineTest = async <ExportsKeys extends TestEngineExportsKeys>({
        target, testCode = '', exports, extraCompilation = {}
    }: EngineTestSettings<ExportsKeys>) => {
        const transpilationSettings = {}
        const compilation = makeCompilation({
            target,
            audioSettings: {
                channelCount: {in: 2, out: 2},
                bitDepth: 64,
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
        const exportKeys = Object.keys(exports || {}) as Array<keyof ExportsKeys>
        if (target === 'javascript') {
            code += exportKeys.length ? `
                {${exportKeys.map(name => `exports.${name.toString()} = ${name.toString()}`).join('\n')}}
            ` : ''
        } else {
            code += `
                export {${exportKeys.join(', ')}}
            `
        }

        const engine = (await createEngine(target, code)) as TestEngine<ExportsKeys>

        // For asc engine, we need to expose exported test functions on the engine.
        if (target === 'assemblyscript') {
            exportKeys.forEach(name => {
                engine[name] = (engine as any).wasmExports[name]
            })
        }

        return engine
    }

    describe('configure/loop', () => {

        it.each([
            {target: 'javascript' as CompilerTarget, outputChannels: 2, blockSize: 4},
            {target: 'javascript' as CompilerTarget, outputChannels: 3, blockSize: 5},
            {target: 'assemblyscript' as CompilerTarget, outputChannels: 2, blockSize: 4},
            {target: 'assemblyscript' as CompilerTarget, outputChannels: 3, blockSize: 5},
        ])('should configure and return an output block of the right size %s', async ({ target, outputChannels, blockSize }) => {
            const nodeImplementations: NodeImplementations = {
                DUMMY: {
                    loop: (
                        _,
                        { globs },
                        { audioSettings: { channelCount }, target }
                    ) => target === 'assemblyscript' ? `
                        for (let channel: Int = 0; channel < ${channelCount.out}; channel++) {
                            ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] = 2.0
                        }
                    `: `
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

            const engine = await initializeEngineTest({ target, extraCompilation: {graph, nodeImplementations, audioSettings: audioSettings} })

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
        })

        it.each([
            {target: 'javascript' as CompilerTarget},
            {target: 'assemblyscript' as CompilerTarget},
        ])('should take input block and pass it to the loop %s', async ({ target }) => {
            const nodeImplementations: NodeImplementations = {
                DUMMY: {
                    loop: (
                        _,
                        { globs },
                        { audioSettings: { channelCount }, target }
                    ) => target === 'assemblyscript' ? `
                        for (let channel: Int = 0; channel < ${channelCount.in}; channel++) {
                            ${globs.output}[${globs.iterFrame} + ${globs.blockSize} * channel] 
                                = ${globs.input}[${globs.iterFrame} + ${globs.blockSize} * channel]
                        }
                    `: `
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

            const engine = await initializeEngineTest({ target, extraCompilation: {graph, nodeImplementations, audioSettings: audioSettings} }, )

            engine.configure(44100, blockSize)
            engine.loop(input, output)
            assert.deepStrictEqual(output, [
                new Float32Array([2, 4, 6, 8]),
                new Float32Array([1, 3, 5, 7]),
                new Float32Array([0, 0, 0, 0]),
            ])
        })
    })

    describe('setArray', () => {
        it.each([
            {target: 'javascript' as CompilerTarget},
            {target: 'assemblyscript' as CompilerTarget},
        ])('should set the array %s', async ({target}) => {

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
                'testReadArray1': 1,
                'testReadArray2': 1,
                'testReadArray3': 1,
            }

            const engine = await initializeEngineTest({ target, testCode, exports }, )

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
            {target: 'javascript' as CompilerTarget},
            {target: 'assemblyscript' as CompilerTarget},
        ])('should create the specified accessors for signal values %s', async ({target}) => {
            const testCode: Code = `
                let bla: Float = 1
                let bli: Float = 2
            `

            const accessorSpecs: AccessorSpecs = {
                bla: { access: 'r', type: 'signal' },
                bli: { access: 'rw', type: 'signal' },
            }

            const engine = await initializeEngineTest({ target, testCode, extraCompilation: {accessorSpecs} }, )

            assert.deepStrictEqual(
                filterPortFunctionKeys(engine.accessors).sort(),
                [
                    'read_bla',
                    'read_bli',
                    'write_bli',
                ].sort()
            )
    
            assert.strictEqual(engine.accessors.read_bla(), 1)
            assert.strictEqual(engine.accessors.read_bli(), 2)
            engine.accessors.write_bli(666.666)
            assert.strictEqual(round(engine.accessors.read_bli()), 666.666)
    
        })

        it.each([
            {target: 'javascript' as CompilerTarget},
            {target: 'assemblyscript' as CompilerTarget},
        ])('should create the specified accessors for message values %s', async ({target}) => {
            // prettier-ignore
            const testCode: Code = `
                let bluMessage1: Message = msg_create([ MSG_DATUM_TYPE_FLOAT, MSG_DATUM_TYPE_STRING, 4 ])
                msg_writeFloatDatum(bluMessage1, 0, 111)
                msg_writeStringDatum(bluMessage1, 1, 'heho')

                let bluMessage2: Message = msg_create([ MSG_DATUM_TYPE_FLOAT ])
                msg_writeFloatDatum(bluMessage2, 0, 222)
                
                let blo: Message[] = [bluMessage2]
                let blu: Message[] = [bluMessage1, bluMessage2]
            `

            const accessorSpecs: AccessorSpecs = {
                blo: { access: 'r', type: 'message' },
                blu: { access: 'rw', type: 'message' },
            }

            const engine = await initializeEngineTest({ target, testCode, extraCompilation: {accessorSpecs} }, )

            assert.deepStrictEqual(
                filterPortFunctionKeys(engine.accessors).sort(),
                [
                    'read_blo',
                    'read_blu',
                    'write_blu',
                ].sort()
            )
            assert.deepStrictEqual(engine.accessors.read_blo(), [[222]])
            assert.deepStrictEqual(engine.accessors.read_blu(), [[111, 'heho'], [222]])
            engine.accessors.write_blu([['blabla', 'bloblo'], [333]])
            assert.deepStrictEqual(engine.accessors.read_blu(), [['blabla', 'bloblo'], [333]])
    
        })
    })

    describe('fs', () => {
        describe('read sound file', () => {
            const sharedTestingCode = `
                let receivedId: fs_OperationId = -1
                let receivedStatus: fs_OperationStatus = -1
                let receivedSound: FloatArray[] = []
                function testStartReadFile (array: FloatArray): Int {
                    return fs_readSoundFile('/some/url', function(
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
                {target: 'javascript' as CompilerTarget},
                {target: 'assemblyscript' as CompilerTarget},
            ])('should register the operation success %s', async ({target}) => {
                const testCode: Code = sharedTestingCode + `
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
                    'testStartReadFile': 1,
                    'testOperationId': 1,
                    'testOperationStatus': 1,
                    'testSoundLength': 1,
                    'testReceivedSound': 1,
                    'testOperationCleaned': 1,
                }

                const engine = await initializeEngineTest({ target, testCode, exports }, )

                // 1. Some function in the engine requests a read file operation.
                // Request is sent to host via callback
                const called: Array<Array<any>> = []
                engine.fs.onRequestReadSoundFile = (...args: any) => called.push(args)

                const operationId = engine.testStartReadFile()
            
                // TODO : add infos
                assert.deepStrictEqual(called[0].slice(0, 2), [
                    operationId,
                    '/some/url',
                ])


                // 2. Hosts handles the operation. It then calls fs_readSoundFileResponse when done.
                engine.fs.readSoundFileResponse(
                    operationId,
                    FS_OPERATION_SUCCESS,
                    [
                        new Float32Array([-1, -2, -3]),
                        new Float32Array([4, 5, 6]),
                        new Float32Array([-7, -8, -9]),
                    ]
                )

                // 3. Engine-side the request initiator gets notified via callback
                assert.strictEqual(
                    engine.testOperationId(),
                    operationId
                )
                assert.strictEqual(
                    engine.testOperationStatus(),
                    FS_OPERATION_SUCCESS
                )
                assert.strictEqual(engine.testSoundLength(), 3)
                assert.ok(engine.testReceivedSound())
                assert.ok(engine.testOperationCleaned(operationId))
            })

            it.each([
                {target: 'javascript' as CompilerTarget},
                {target: 'assemblyscript' as CompilerTarget},
            ])('should register the operation failure %s', async ({target}) => {
                const testCode: Code = sharedTestingCode

                const exports = {
                    'testStartReadFile': 1,
                    'testOperationId': 1,
                    'testOperationStatus': 1,
                    'testSoundLength': 1,
                }

                const engine = await initializeEngineTest({ target, testCode, exports }, )

                const operationId = engine.testStartReadFile()
                engine.fs.readSoundFileResponse(
                    operationId,
                    FS_OPERATION_FAILURE,
                    []
                )
                assert.strictEqual(
                    engine.testOperationId(),
                    operationId
                )
                assert.strictEqual(
                    engine.testOperationStatus(),
                    FS_OPERATION_FAILURE
                )
                assert.strictEqual(engine.testSoundLength(), 0)
            })
        })
    })

    describe('inletListeners', () => {

        it.each([
            {target: 'javascript' as CompilerTarget},
            {target: 'assemblyscript' as CompilerTarget},
        ])('should create the specified inlet listeners %s', async ({target}) => {
            const graph = makeGraph({
                someNode: {
                    inlets: { someInlet: { type: 'message', id: 'someInlet' } },
                },
            })
    
            const inletListenerSpecs: InletListenerSpecs = {
                ['someNode']: ['someInlet'],
            }

            const accessorSpecs: AccessorSpecs = {
                'someNode_INS_someInlet': {type: 'message', access: 'r'},
            }

            const testCode: Code = `
                const someNode_INS_someInlet: Array<Message> = []

                const m1: Message = msg_create([MSG_DATUM_TYPE_FLOAT, MSG_DATUM_TYPE_FLOAT])
                msg_writeFloatDatum(m1, 0, 11)
                msg_writeFloatDatum(m1, 1, 22)
                const m2: Message = msg_create([MSG_DATUM_TYPE_STRING, 3])
                msg_writeStringDatum(m2, 0, 'bla')

                someNode_INS_someInlet.push(m1)
                someNode_INS_someInlet.push(m2)

                function testCallInletListener(): void {
                    inletListener_someNode_someInlet()
                }
            `

            const exports = {'testCallInletListener': 1}

            const engine = await initializeEngineTest({ 
                target, 
                testCode, 
                extraCompilation: {inletListenerSpecs, accessorSpecs, graph}, 
                exports}, 
                )

            const called: Array<Array<Message>> = []

            assert.ok(engine.inletListeners.someNode.someInlet.onMessages instanceof Function)

            engine.inletListeners.someNode.someInlet.onMessages = (messages: Array<Message>) =>
                called.push(messages)
            
            engine.testCallInletListener()
            assert.deepStrictEqual(called, [[[11, 22], ['bla']]])
        })

    })
})