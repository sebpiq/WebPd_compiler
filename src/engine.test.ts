/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
import packageInfo from '../package.json'
import assert from 'assert'
import compile from './compile'
import { TEST_PARAMETERS, createTestEngine, round } from './test-helpers'
import {
    AudioSettings,
    CompilerTarget,
    NodeImplementations,
    GlobalDefinitions,
    UserCompilationSettings,
    IoMessageSpecs,
} from './compile/types'
import { Engine, Message, SoundFileInfo, EngineMetadata } from './run/types'
import { makeGraph } from './test-helpers/graph-test-helpers'
import { nodeDefaults } from './dsp-graph/graph-helpers'
import { getFloatArrayType } from './run/run-helpers'
import {
    fsReadSoundFile,
    fsReadSoundStream,
    fsWriteSoundFile,
    fsWriteSoundStream,
} from './stdlib/fs/fs'
import { commonsArrays } from './stdlib/commons/commons'
import { ast, Sequence, ConstVar, Func, Var, AnonFunc } from './ast/declare'
import { DspGraph } from './dsp-graph'
import { FS_OPERATION_SUCCESS } from '.'
import { FsNamespaceAll } from './stdlib/fs/types'
import { CommonsNamespaceAll } from './stdlib/commons/types'

describe('Engine', () => {
    interface EngineTestSettings{
        graph?: DspGraph.Graph
        nodeImplementations?: NodeImplementations
        injectedDependencies?: Array<GlobalDefinitions>
        settings?: UserCompilationSettings<any>
    }

    const initializeEngineTest = async <
        ExportedKeys extends string = 'UNKNOWN'
    >(
        target: CompilerTarget,
        bitDepth: AudioSettings['bitDepth'],
        {
            injectedDependencies = [],
            nodeImplementations = {},
            graph = undefined,
            settings = {},
        }: EngineTestSettings
    ) => {
        // Add a dummy node with a dummy node type that is only used to inject specified `dependencies`
        const dependenciesInjectorType = 'DEPENDENCIES_INJECTOR'
        const dependenciesInjectorId = 'dependenciesInjector'
        if (graph && graph[dependenciesInjectorId]) {
            throw new Error(`Unexpected, node with same id already in graph.`)
        }

        const compileResult = await compile(
            {
                ...(graph || {}),
                [dependenciesInjectorId]: {
                    ...nodeDefaults(dependenciesInjectorId),
                    type: dependenciesInjectorType,
                    // Force node to be in the graph traversal
                    // so that it gets compiled.
                    isPushingMessages: true,
                },
            },
            {
                DUMMY: { dsp: () => Sequence([]) },
                ...(nodeImplementations || {}),
                [dependenciesInjectorType]: {
                    dependencies: injectedDependencies,
                },
            },
            target,
            {
                audio: {
                    channelCount: { in: 2, out: 2 },
                    bitDepth,
                },
                ...settings,
            }
        )

        if (compileResult.status !== 0) {
            throw new Error(`Unexpected, compilation failed.`)
        }

        const engine = await createTestEngine<ExportedKeys>(
            target,
            bitDepth,
            compileResult.code,
            injectedDependencies
        )

        return engine
    }

    describe('initialize/dspLoop', () => {
        it.each(
            TEST_PARAMETERS.map((params, i) => ({
                ...params,
                outputChannels: i % 2 === 0 ? 2 : 3,
                blockSize: i % 2 === 0 ? 4 : 5,
            }))
        )(
            'should initialize and return an output block of the right size %s',
            async ({ target, outputChannels, blockSize, bitDepth }) => {
                const floatArrayType = getFloatArrayType(bitDepth)
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        dsp: (
                            _,
                            { core },
                            { audio: { channelCount }, target }
                        ) =>
                            // prettier-ignore
                            target === 'assemblyscript'
                                ? ast`
                                    for (let channel: Int = 0; channel < ${channelCount.out}; channel++) {
                                        ${core.OUTPUT}[${core.IT_FRAME} + ${core.BLOCK_SIZE} * channel] = 2.0
                                    }
                                `
                                : ast`
                                    for (let channel = 0; channel < ${
                                        channelCount.out
                                    }; channel++) {
                                        ${core.OUTPUT}[channel][${core.IT_FRAME}] = 2.0
                                    }
                                `,
                    },
                }

                const graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isPullingSignal: true,
                    },
                })

                const input: Array<Float32Array | Float64Array> = [
                    new floatArrayType(blockSize),
                    new floatArrayType(blockSize),
                ]

                const engine = await initializeEngineTest(target, bitDepth, {
                    graph,
                    nodeImplementations,
                    settings: {
                        audio: {
                            bitDepth,
                            channelCount: { in: 2, out: outputChannels },
                        },
                    },
                })

                const output: Array<Float32Array | Float64Array> = []
                for (let channel = 0; channel < outputChannels; channel++) {
                    output.push(new floatArrayType(blockSize))
                }

                const expected: Array<Float32Array | Float64Array> = []
                for (let channel = 0; channel < outputChannels; channel++) {
                    expected.push(new floatArrayType(blockSize).fill(2))
                }

                engine.initialize(44100, blockSize)
                engine.dspLoop(input, output)
                assert.deepStrictEqual(output, expected)
            }
        )

        it.each(TEST_PARAMETERS)(
            'should take input block and pass it to the dspLoop %s',
            async ({ target, bitDepth }) => {
                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        dsp: (
                            _,
                            { core },
                            { target, audio: { channelCount } }
                        ) =>
                            // prettier-ignore
                            target === 'assemblyscript'
                                ? ast`
                                    for (let channel: Int = 0; channel < ${
                                        channelCount.in
                                    }; channel++) {
                                        ${core.OUTPUT}[${core.IT_FRAME} + ${core.BLOCK_SIZE} * channel] 
                                            = ${core.INPUT}[${core.IT_FRAME} + ${core.BLOCK_SIZE} * channel]
                                    }
                                `
                                : ast`
                                    for (let channel = 0; channel < ${
                                        channelCount.in
                                    }; channel++) {
                                        ${core.OUTPUT}[channel][${core.IT_FRAME}] 
                                            = ${core.INPUT}[channel][${core.IT_FRAME}]
                                    }
                                `,
                    },
                }

                const graph = makeGraph({
                    outputNode: {
                        type: 'DUMMY',
                        isPullingSignal: true,
                    },
                })

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

                const engine = await initializeEngineTest(target, bitDepth, {
                    graph,
                    nodeImplementations,
                    settings: {
                        audio: {
                            bitDepth,
                            channelCount: { in: 2, out: 3 },
                        },
                    },
                })

                engine.initialize(44100, blockSize)
                engine.dspLoop(input, output)
                assert.deepStrictEqual(output, [
                    new Float32Array([2, 4, 6, 8]),
                    new Float32Array([1, 3, 5, 7]),
                    new Float32Array([0, 0, 0, 0]),
                ])
            }
        )

        it.each(TEST_PARAMETERS)(
            'should export metadata audio settings and update it after initialize %s',
            async ({ target, bitDepth }) => {
                const graph = makeGraph({
                    bla: {
                        isPushingMessages: true,
                        inlets: { blo: { type: 'message', id: 'blo' } },
                    },
                    bli: {
                        isPushingMessages: true,
                        outlets: { blu: { type: 'message', id: 'blu' } },
                    },
                })

                const nodeImplementations: NodeImplementations = {
                    DUMMY: {
                        messageReceivers: (_, { msg }) => ({
                            blo: AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )`return`,
                        }),
                    },
                }

                const audioSettings: AudioSettings = {
                    bitDepth,
                    channelCount: { in: 2, out: 3 },
                }

                const engine = await initializeEngineTest(target, bitDepth, {
                    graph,
                    nodeImplementations,
                    settings: {
                        audio: audioSettings,
                        io: {
                            messageReceivers: {
                                bla: ['blo'],
                            },
                            messageSenders: {
                                bli: ['blu'],
                            },
                        },
                    },
                })

                assert.deepStrictEqual<EngineMetadata>(engine.metadata, {
                    libVersion: packageInfo.version,
                    customMetadata: {},
                    settings: {
                        audio: {
                            ...audioSettings,
                            blockSize: 0,
                            sampleRate: 0,
                        },
                        io: {
                            messageReceivers: { bla: ['blo'] },
                            messageSenders: { bli: ['blu'] },
                        },
                    },
                    compilation: {
                        variableNamesIndex:
                            engine.metadata.compilation.variableNamesIndex,
                    },
                })
                assert.ok(
                    Object.keys(engine.metadata.compilation.variableNamesIndex)
                        .length
                )

                engine.initialize(44100, 1024)

                assert.strictEqual(
                    engine.metadata.settings.audio.blockSize,
                    1024
                )
                assert.strictEqual(
                    engine.metadata.settings.audio.sampleRate,
                    44100
                )
            }
        )
    })

    describe('commons', () => {
        describe('getArray', () => {
            it.each(TEST_PARAMETERS)(
                'should get the array %s',
                async ({ target, bitDepth }) => {
                    const floatArrayType = getFloatArrayType(bitDepth)
                    const testCode: GlobalDefinitions = {
                        namespace: '_',
                        // prettier-ignore
                        code: (_, { commons }) => ast`
                            const array = createFloatArray(4)
                            array[0] = 123
                            array[1] = 456
                            array[2] = 789
                            array[3] = 234
                            ${(commons as CommonsNamespaceAll)._ARRAYS}.set('array1', array)
                        `,
                    }

                    const engine = await initializeEngineTest(
                        target,
                        bitDepth,
                        {
                            injectedDependencies: [commonsArrays, testCode],
                        }
                    )

                    assert.deepStrictEqual(
                        engine.globals.commons.getArray('array1'),
                        new floatArrayType([123, 456, 789, 234])
                    )
                }
            )
        })

        describe('setArray', () => {
            it.each(TEST_PARAMETERS)(
                'should set the array %s',
                async ({ target, bitDepth }) => {
                    const testCode: GlobalDefinitions = {
                        namespace: 'tests',
                        // prettier-ignore
                        code: (_, { commons }) =>
                            Sequence([
                                Func(
                                    'testReadArray1',
                                    [Var(`Int`, `index`)],
                                    'Float'
                                )`
                                    return ${(commons as CommonsNamespaceAll)._ARRAYS}.get('array1')[index]
                                `,
                                Func(
                                    'testReadArray2',
                                    [Var(`Int`, `index`)],
                                    'Float'
                                )`
                                    return ${(commons as CommonsNamespaceAll)._ARRAYS}.get('array2')[index]
                                `,
                                Func(
                                    'testReadArray3',
                                    [Var(`Int`, `index`)],
                                    'Float'
                                )`
                                    return ${(commons as CommonsNamespaceAll)._ARRAYS}.get('array3')[index]
                                `,
                                Func(
                                    'testIsFloatArray',
                                    [Var(`Int`, `index`)],
                                    'void'
                                )`
                                    return ${(commons as CommonsNamespaceAll)._ARRAYS}.get('array3').set([111, 222])
                                `,
                            ]),
                        exports: () => [
                            'testReadArray1',
                            'testReadArray2',
                            'testReadArray3',
                            'testIsFloatArray',
                        ],
                    }

                    const engine = await initializeEngineTest<
                        | 'testReadArray1'
                        | 'testReadArray2'
                        | 'testReadArray3'
                        | 'testIsFloatArray'
                    >(target, bitDepth, {
                        injectedDependencies: [commonsArrays, testCode],
                    })

                    engine.globals.commons.setArray(
                        'array1',
                        new Float32Array([11.1, 22.2, 33.3])
                    )
                    engine.globals.commons.setArray(
                        'array2',
                        new Float64Array([44.4, 55.5])
                    )
                    engine.globals.commons.setArray('array3', [66.6, 77.7])

                    let actual: number
                    actual = engine.testReadArray1(1)
                    assert.strictEqual(round(actual), 22.2)
                    actual = engine.testReadArray2(0)
                    assert.strictEqual(round(actual), 44.4)
                    actual = engine.testReadArray3(1)
                    assert.strictEqual(round(actual), 77.7)
                    assert.doesNotThrow(() => engine.testIsFloatArray())
                }
            )
        })

        describe('embed arrays', () => {
            it.each(TEST_PARAMETERS)(
                'should embed arrays passed to the compiler %s',
                async ({ target, bitDepth }) => {
                    const floatArrayType = getFloatArrayType(bitDepth)
                    const engine = await initializeEngineTest(
                        target,
                        bitDepth,
                        {
                            settings: {
                                arrays: {
                                    array1: new Float32Array([1, 2, 3, 4]),
                                    array2: new Float32Array([
                                        11, 22, 33, 44, 55,
                                    ]),
                                    array3: new Float32Array(0),
                                },
                            },
                            injectedDependencies: [commonsArrays],
                        }
                    )
                    assert.deepStrictEqual(
                        engine.globals.commons.getArray('array1'),
                        new floatArrayType([1, 2, 3, 4])
                    )
                    assert.deepStrictEqual(
                        engine.globals.commons.getArray('array2'),
                        new floatArrayType([11, 22, 33, 44, 55])
                    )
                    assert.deepStrictEqual(
                        engine.globals.commons.getArray('array3'),
                        new floatArrayType([])
                    )
                }
            )
        })
    })

    describe('fs', () => {
        describe('read sound file', () => {
            const sharedTestingCode: GlobalDefinitions = {
                namespace: 'tests',
                // prettier-ignore
                code: (_, { fs }) =>
                    Sequence([
                        Var(fs!.OperationId, `receivedId`, `-1`),
                        Var(fs!.OperationStatus, `receivedStatus`, `-1`),
                        Var(`FloatArray[]`, `receivedSound`, `[]`),

                        Func('testStartReadFile', [], 'Int')`
                            return ${fs!.readSoundFile}(
                                '/some/url', 
                                {
                                    channelCount: 3,
                                    sampleRate: 48000, 
                                    bitDepth: 64, 
                                    encodingFormat: 'aiff', 
                                    endianness: 'l',
                                    extraOptions: '',
                                }, ${Func(
                                    'readSoundFileComplete',
                                    [
                                        Var(fs!.OperationId, `id`),
                                        Var(fs!.OperationStatus, `status`),
                                        Var(`FloatArray[]`, `sound`),
                                    ],
                                    'void'
                                )`
                                    receivedId = id
                                    receivedStatus = status
                                    receivedSound = sound
                                `}
                            )
                        `,
                        Func('testOperationId', [], 'Int')`
                            return receivedId
                        `,
                        Func('testOperationStatus', [], 'Int')`
                            return receivedStatus
                        `,
                        Func('testSoundLength', [], 'Int')`
                            return receivedSound.length
                        `,
                        Func(
                            'testOperationCleaned',
                            [Var(fs!.OperationId, `id`)],
                            'boolean'
                        )`
                            return !${(fs as FsNamespaceAll)._OPERATIONS_IDS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_SOUND_CALLBACKS}.has(id)
                        `,
                    ]),
                exports: () => [
                    'testStartReadFile',
                    'testOperationId',
                    'testOperationStatus',
                    'testSoundLength',
                    'testOperationCleaned',
                ],
            }

            type ReadSoundFileExportedKeys =
                | 'testStartReadFile'
                | 'testOperationId'
                | 'testOperationStatus'
                | 'testSoundLength'
                | 'testOperationCleaned'

            it.each(TEST_PARAMETERS)(
                'should register the operation success %s',
                async ({ target, bitDepth }) => {
                    const floatArrayType = getFloatArrayType(bitDepth)
                    const testCode: GlobalDefinitions = {
                        namespace: 'tests',
                        // prettier-ignore
                        code: () =>
                            Sequence([
                                Func('testReceivedSound', [], 'boolean')`
                                    return receivedSound[0][0] === -1
                                        && receivedSound[0][1] === -2
                                        && receivedSound[0][2] === -3
                                        && receivedSound[1][0] === 4
                                        && receivedSound[1][1] === 5
                                        && receivedSound[1][2] === 6
                                        && receivedSound[2][0] === -7
                                        && receivedSound[2][1] === -8
                                        && receivedSound[2][2] === -9
                                `,
                            ]),
                        exports: () => ['testReceivedSound'],
                    }

                    const engine = await initializeEngineTest<
                        ReadSoundFileExportedKeys | 'testReceivedSound'
                    >(target, bitDepth, {
                        injectedDependencies: [
                            fsReadSoundFile,
                            sharedTestingCode,
                            testCode,
                        ],
                    })

                    // 1. Some function in the engine requests a read file operation.
                    // Request is sent to host via callback
                    const called: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onReadSoundFile']
                        >
                    > = []
                    engine.globals.fs!.onReadSoundFile = (...args) =>
                        called.push(args)

                    const operationId = engine.testStartReadFile()

                    assert.deepStrictEqual(called[0], [
                        operationId,
                        '/some/url',
                        [3, 48000, 64, 'aiff', 'l', ''] as SoundFileInfo,
                    ])

                    // 2. Hosts handles the operation. It then calls fs_sendReadSoundFileResponse when done.
                    engine.globals.fs!.sendReadSoundFileResponse!(
                        operationId,
                        FS_OPERATION_SUCCESS,
                        [
                            new floatArrayType([-1, -2, -3]),
                            new floatArrayType([4, 5, 6]),
                            new floatArrayType([-7, -8, -9]),
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
            const sharedTestingCode: GlobalDefinitions = {
                namespace: 'tests',
                // prettier-ignore
                code: (_, { fs }) =>
                    Sequence([
                        Var(fs!.OperationId, `receivedId`, `-1`),
                        Var(
                            fs!.OperationStatus,
                            'receivedStatus',
                            '-1'
                        ),
                        ConstVar(`Int`, `channelCount`, `3`),

                        Func(
                            'testStartReadStream',
                            [Var(`FloatArray`, `array`)],
                            'Int'
                        )`
                            return ${fs!.openSoundReadStream}(
                                '/some/url', 
                                {
                                    channelCount: channelCount,
                                    sampleRate: 48000, 
                                    bitDepth: 32, 
                                    encodingFormat: 'next', 
                                    endianness: 'l',
                                    extraOptions: '--some 8 --options'
                                }, 
                                ${Func(
                                    'fs_openSoundReadStreamComplete',
                                    [
                                        Var(fs!.OperationId, `id`),
                                        Var(
                                            fs!.OperationStatus,
                                            'status'
                                        ),
                                    ],
                                    'void'
                                )`
                                    receivedId = id
                                    receivedStatus = status
                                `}
                            )
                        `,

                        Func('testOperationId', [], 'Int')`
                            return receivedId
                        `,

                        Func('testOperationStatus', [], 'Int')`
                            return receivedStatus
                        `,

                        Func(
                            'testOperationChannelCount',
                            [Var(fs!.OperationId, `id`)],
                            'Int'
                        )`
                            return ${(fs as FsNamespaceAll)
                                .SOUND_STREAM_BUFFERS}.get(id).length
                        `,

                        Func(
                            'testOperationCleaned',
                            [Var(fs!.OperationId, `id`)],
                            'boolean'
                        )`
                            return !${(fs as FsNamespaceAll)._OPERATIONS_IDS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll)
                                    ._OPERATIONS_SOUND_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll).SOUND_STREAM_BUFFERS}.has(id)
                        `,
                    ]),
                exports: () => [
                    'testStartReadStream',
                    'testOperationId',
                    'testOperationStatus',
                    'testOperationChannelCount',
                    'testOperationCleaned',
                ],
            }

            type ReadSoundStreamExportedKeys =
                | 'testStartReadStream'
                | 'testOperationId'
                | 'testOperationStatus'
                | 'testOperationChannelCount'
                | 'testOperationCleaned'

            it.each(TEST_PARAMETERS)(
                'should stream data in %s',
                async ({ target, bitDepth }) => {
                    const testCode: GlobalDefinitions = {
                        namespace: 'tests',
                        // prettier-ignore
                        code: (_, { fs, buf }) =>
                            Sequence([
                                Func(
                                    'testReceivedSound',
                                    [Var(fs!.OperationId, `id`)],
                                    'boolean'
                                )`
                                    const buffers = ${(fs as FsNamespaceAll).SOUND_STREAM_BUFFERS}.get(id)
                                    return ${buf!.pullSample}(buffers[0]) === -1
                                        && ${buf!.pullSample}(buffers[0]) === -2
                                        && ${buf!.pullSample}(buffers[0]) === -3
                                `,
                            ]),
                        exports: () => ['testReceivedSound'],
                    }

                    const engine = await initializeEngineTest<
                        ReadSoundStreamExportedKeys | 'testReceivedSound'
                    >(target, bitDepth, {
                        injectedDependencies: [
                            fsReadSoundStream,
                            sharedTestingCode,
                            testCode,
                        ],
                    })

                    // 1. Some function in the engine requests a read stream operation.
                    // Request is sent to host via callback
                    const calledOpen: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onOpenSoundReadStream']
                        >
                    > = []
                    const calledClose: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onCloseSoundStream']
                        >
                    > = []
                    engine.globals.fs!.onOpenSoundReadStream = (...args) =>
                        calledOpen.push(args)
                    engine.globals.fs!.onCloseSoundStream = (...args) =>
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

                    // 2. Hosts handles the operation. It then calls ${fs!.sendSoundStreamData} to send in data.
                    const writtenFrameCount = engine.globals.fs!
                        .sendSoundStreamData!(operationId, [
                        new Float32Array([-1, -2, -3]),
                        new Float32Array([4, 5, 6]),
                        new Float32Array([-7, -8, -9]),
                    ])
                    assert.strictEqual(writtenFrameCount, 3)
                    assert.ok(engine.testReceivedSound(operationId))

                    // 3. The stream is closed
                    engine.globals.fs!.closeSoundStream!(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
                    assert.ok(engine.testOperationCleaned(operationId))
                    // Test host callback was called
                    assert.deepStrictEqual(calledClose[0]!.slice(0, 2), [
                        operationId,
                        FS_OPERATION_SUCCESS,
                    ])
                    // Test engine callback was called
                    assert.strictEqual(engine.testOperationId(), operationId)
                    assert.strictEqual(
                        engine.testOperationStatus(),
                        FS_OPERATION_SUCCESS
                    )
                }
            )
        })

        describe('write sound stream', () => {
            const sharedTestingCode: GlobalDefinitions = {
                namespace: 'tests',
                // prettier-ignore
                code: (_, { fs }) =>
                    Sequence([
                        Var(fs!.OperationId, `receivedId`, `-1`),
                        Var(fs!.OperationStatus, `receivedStatus`, `-1`),
                        ConstVar(`Int`, `channelCount`, `3`),
                        ConstVar(`Int`, `fsBlockSize`, `2`),
                        Var(`Int`, `counter`, `0`),

                        Func('testStartWriteStream', [], 'Int')`
                            return ${fs!.openSoundWriteStream}(
                                '/some/url', 
                                {
                                    channelCount: channelCount,
                                    sampleRate: 44100, 
                                    bitDepth: 24, 
                                    encodingFormat: 'aiff', 
                                    endianness: 'b',
                                    extraOptions: '--bla',
                                }, 
                                ${Func(
                                    'fs_openSoundWriteStreamComplete',
                                    [
                                        Var(fs!.OperationId, `id`),
                                        Var(fs!.OperationStatus, `status`),
                                    ],
                                    'void'
                                )`
                                    receivedId = id
                                    receivedStatus = status
                                `}
                            )
                        `, 
                        Func(
                            'testSendSoundStreamData',
                            [Var(fs!.OperationId, `id`)],
                            'void'
                        )`
                            ${ConstVar(
                                'FloatArray[]',
                                'block',
                                `[
                                    createFloatArray(fsBlockSize),
                                    createFloatArray(fsBlockSize),
                                    createFloatArray(fsBlockSize),
                                ]`
                            )}
                            block[0][0] = toFloat(10 + fsBlockSize * counter)
                            block[0][1] = toFloat(11 + fsBlockSize * counter)

                            block[1][0] = toFloat(20 + fsBlockSize * counter)
                            block[1][1] = toFloat(21 + fsBlockSize * counter)

                            block[2][0] = toFloat(30 + fsBlockSize * counter)
                            block[2][1] = toFloat(31 + fsBlockSize * counter)

                            counter++
                            ${fs!.sendSoundStreamData}(id, block)
                        `,
                        Func('testOperationId', [], 'Int')`
                            return receivedId
                        `,
                        Func('testOperationStatus', [], 'Int')`
                            return receivedStatus
                        `,
                        Func(
                            'testOperationCleaned',
                            [Var(fs!.OperationId, `id`)],
                            'boolean'
                        )`
                            return !${(fs as FsNamespaceAll)._OPERATIONS_IDS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_SOUND_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll).SOUND_STREAM_BUFFERS}.has(id)
                        `,
                    ]),
                exports: () => [
                    'testStartWriteStream',
                    'testSendSoundStreamData',
                    'testOperationId',
                    'testOperationStatus',
                    'testOperationCleaned',
                ],
            }

            type WriteSoundStreamExportedKeys =
                | 'testStartWriteStream'
                | 'testSendSoundStreamData'
                | 'testOperationId'
                | 'testOperationStatus'
                | 'testOperationCleaned'

            it.each(TEST_PARAMETERS)(
                'should stream data in %s',
                async ({ target, bitDepth }) => {
                    const floatArrayType = getFloatArrayType(bitDepth)

                    const engine =
                        await initializeEngineTest<WriteSoundStreamExportedKeys>(
                            target,
                            bitDepth,
                            {
                                injectedDependencies: [
                                    fsWriteSoundStream,
                                    sharedTestingCode,
                                ],
                            }
                        )

                    // 1. Some function in the engine requests a write stream operation.
                    // Request is sent to host via callback
                    const calledOpen: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onOpenSoundWriteStream']
                        >
                    > = []
                    const calledClose: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onCloseSoundStream']
                        >
                    > = []
                    const calledSoundStreamData: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onSoundStreamData']
                        >
                    > = []
                    engine.globals.fs!.onOpenSoundWriteStream = (...args) =>
                        calledOpen.push(args)
                    engine.globals.fs!.onSoundStreamData = (...args) =>
                        calledSoundStreamData.push(args)
                    engine.globals.fs!.onCloseSoundStream = (...args) =>
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
                    engine.globals.fs!.closeSoundStream!(
                        operationId,
                        FS_OPERATION_SUCCESS
                    )
                    assert.ok(engine.testOperationCleaned(operationId))
                    // Test host callback was called
                    assert.deepStrictEqual(calledClose[0]!.slice(0, 2), [
                        operationId,
                        FS_OPERATION_SUCCESS,
                    ])
                    // Test engine callback was called
                    assert.strictEqual(engine.testOperationId(), operationId)
                    assert.strictEqual(
                        engine.testOperationStatus(),
                        FS_OPERATION_SUCCESS
                    )
                }
            )
        })

        describe('write sound file', () => {
            const sharedTestingCode: GlobalDefinitions = {
                namespace: 'tests',
                // prettier-ignore
                code: (_, { fs }) =>
                    Sequence([
                        Var(fs!.OperationId, `receivedId`, `-1`),
                        Var(
                            fs!.OperationStatus,
                            'receivedStatus',
                            '-1'
                        ),
                        ConstVar(
                            'FloatArray[]',
                            'sound',
                            `[
                                createFloatArray(2),
                                createFloatArray(2),
                                createFloatArray(2),
                                createFloatArray(2),
                            ]`
                        ),
                        `
                        sound[0][0] = 11
                        sound[0][1] = 12
                        sound[1][0] = 21
                        sound[1][1] = 22
                        sound[2][0] = 31
                        sound[2][1] = 32
                        sound[3][0] = 41
                        sound[3][1] = 42
                        `,

                        Func('testStartWriteFile', [], 'Int')`
                            return ${fs!.writeSoundFile}(
                                sound, 
                                '/some/url', 
                                {
                                    channelCount: sound.length,
                                    sampleRate: 44100, 
                                    bitDepth: 24, 
                                    encodingFormat: 'wave', 
                                    endianness: 'l',
                                    extraOptions: '',
                                }, ${Func(
                                    'fs_writeSoundFileComplete',
                                    [
                                        Var(fs!.OperationId, `id`),
                                        Var(
                                            fs!.OperationStatus,
                                            'status'
                                        ),
                                    ],
                                    'void'
                                )`
                                    receivedId = id
                                    receivedStatus = status
                                `}
                            )
                        `,
                        Func('testOperationId', [], 'Int')`
                            return receivedId
                        `,
                        Func('testOperationStatus', [], 'Int')`
                            return receivedStatus
                        `,
                        Func(
                            'testOperationCleaned',
                            [Var(fs!.OperationId, `id`)],
                            'boolean'
                        )`
                            return !${(fs as FsNamespaceAll)._OPERATIONS_IDS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_CALLBACKS}.has(id)
                                && !${(fs as FsNamespaceAll)._OPERATIONS_SOUND_CALLBACKS}.has(id)
                        `,
                    ]),
                exports: () => [
                    'testStartWriteFile',
                    'testOperationId',
                    'testOperationStatus',
                    'testOperationCleaned',
                ],
            }

            type WriteSoundFileExportedKeys =
                | 'testStartWriteFile'
                | 'testOperationId'
                | 'testOperationStatus'
                | 'testOperationCleaned'

            it.each(TEST_PARAMETERS)(
                'should register the operation success %s',
                async ({ target, bitDepth }) => {
                    const floatArrayType = getFloatArrayType(bitDepth)

                    const engine =
                        await initializeEngineTest<WriteSoundFileExportedKeys>(
                            target,
                            bitDepth,
                            {
                                injectedDependencies: [
                                    fsWriteSoundFile,
                                    sharedTestingCode,
                                ],
                            }
                        )

                    // 1. Some function in the engine requests a write file operation.
                    // Request is sent to host via callback
                    const called: Array<
                        Parameters<
                            NonNullable<
                                Engine['globals']['fs']
                            >['onWriteSoundFile']
                        >
                    > = []
                    engine.globals.fs!.onWriteSoundFile = (...args) =>
                        called.push(args)

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
                    engine.globals.fs!.sendWriteSoundFileResponse!(
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

    describe('io.messageSenders', () => {
        it.each(TEST_PARAMETERS)(
            'should create the specified outlet listeners %s',
            async ({ target, bitDepth }) => {
                // We only test that the outlet listeners are created and that calling them works.
                // We don't need to actually compile any node
                const graph = makeGraph({
                    someNode1: {
                        isPushingMessages: true,
                        outlets: {
                            someOutlet1: { type: 'message', id: 'someOutlet1' },
                            someOutlet2: { type: 'message', id: 'someOutlet2' },
                        },
                    },
                    someNode2: {
                        isPushingMessages: true,
                        outlets: {
                            someOutlet1: { type: 'message', id: 'someOutlet1' },
                        },
                    },
                })

                const messageSenders: IoMessageSpecs = {
                    ['someNode1']: ['someOutlet1', 'someOutlet2'],
                    ['someNode2']: ['someOutlet1'],
                }

                const testCode: GlobalDefinitions = {
                    namespace: 'tests',
                    // prettier-ignore
                    code: (_, { msg }) =>
                        Sequence([
                            ConstVar(
                                msg.Message,
                                'm1',
                                `${msg.create}([
                                    ${msg.FLOAT_TOKEN}, 
                                    ${msg.FLOAT_TOKEN}
                                ])`
                            ),
                            ConstVar(
                                msg.Message,
                                'm2',
                                `${msg.create}([${msg.STRING_TOKEN}, 3])`
                            ),
                            `
                            ${msg.writeFloatToken}(m1, 0, 11)
                            ${msg.writeFloatToken}(m1, 1, 22)
                            ${msg.writeStringToken}(m2, 0, 'bla')
                            `,
                            Func('testCallMessageSend')`
                                IO_snd_someNode1_someOutlet1(m1)
                                IO_snd_someNode1_someOutlet2(m2)
                                IO_snd_someNode2_someOutlet1(m1)
                            `,
                        ]),
                    exports: () => ['testCallMessageSend'],
                }

                const engine =
                    await initializeEngineTest<'testCallMessageSend'>(
                        target,
                        bitDepth,
                        {
                            injectedDependencies: [testCode],
                            graph,
                            settings: {
                                io: {
                                    messageSenders,
                                },
                            },
                        }
                    )

                const called11: Array<Message> = []
                const called12: Array<Message> = []
                const called21: Array<Message> = []

                assert.ok(
                    engine.io.messageSenders.someNode1!.someOutlet1! instanceof
                        Function
                )
                assert.ok(
                    engine.io.messageSenders.someNode1!.someOutlet2! instanceof
                        Function
                )
                assert.ok(
                    engine.io.messageSenders.someNode2!.someOutlet1! instanceof
                        Function
                )

                engine.io.messageSenders.someNode1!.someOutlet1! = (
                    message: Message
                ) => called11.push(message)

                engine.io.messageSenders.someNode1!.someOutlet2! = (
                    message: Message
                ) => called12.push(message)

                engine.io.messageSenders.someNode2!.someOutlet1! = (
                    message: Message
                ) => called21.push(message)

                engine.testCallMessageSend()
                assert.deepStrictEqual(called11, [[11, 22]])
                assert.deepStrictEqual(called12, [['bla']])
                assert.deepStrictEqual(called21, [[11, 22]])
            }
        )
    })

    describe('io.messageReceivers', () => {
        it.each(TEST_PARAMETERS)(
            'should create the specified inlet callers %s',
            async ({ target, bitDepth }) => {
                const graph = makeGraph({
                    someNode1: {
                        type: 'someNodeType',
                        inlets: {
                            someInlet1: { type: 'message', id: 'someInlet1' },
                            someInlet2: { type: 'message', id: 'someInlet2' },
                        },
                        isPushingMessages: true,
                    },
                    someNode2: {
                        type: 'someNodeType',
                        inlets: {
                            someInlet1: { type: 'message', id: 'someInlet1' },
                        },
                        isPushingMessages: true,
                    },
                })

                const messageReceivers: IoMessageSpecs = {
                    someNode1: ['someInlet1', 'someInlet2'],
                    someNode2: ['someInlet1'],
                }

                const nodeImplementations: NodeImplementations = {
                    someNodeType: {
                        messageReceivers: ({ node: { id } }, { msg }) => ({
                            someInlet1: AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )`received.get('${id}:1').push(m);return`,
                            someInlet2: AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )`received.get('${id}:2').push(m);return`,
                        }),
                    },
                }

                const testCode: GlobalDefinitions = {
                    namespace: 'tests',
                    // prettier-ignore
                    code: (_, { msg }) =>
                        Sequence([
                            ConstVar(
                                `Map<string, Array<${msg.Message}>>`,
                                'received',
                                'new Map()'
                            ),
                            `
                            received.set("someNode1:1", [])
                            received.set("someNode1:2", [])
                            received.set("someNode2:1", [])
                            `,

                            Func(
                                'messageIsCorrect',
                                [Var(msg.Message, `message`)],
                                'boolean'
                            )`
                                return ${msg.getLength}(message) === 2
                                    && ${msg.isFloatToken}(message, 0)
                                    && ${msg.isStringToken}(message, 1)
                                    && ${msg.readFloatToken}(message, 0) === 666
                                    && ${msg.readStringToken}(message, 1) === 'n4t4s'
                            `,

                            Func('testMessageReceived', [], 'boolean')`
                                return received.get("someNode1:1").length === 1
                                    && received.get("someNode1:2").length === 1
                                    && received.get("someNode2:1").length === 1
                                    && messageIsCorrect(received.get("someNode1:1")[0])
                                    && messageIsCorrect(received.get("someNode1:2")[0])
                                    && messageIsCorrect(received.get("someNode2:1")[0])
                            `,
                        ]),
                    exports: () => ['testMessageReceived'],
                }

                const engine =
                    await initializeEngineTest<'testMessageReceived'>(
                        target,
                        bitDepth,
                        {
                            injectedDependencies: [testCode],
                            graph,
                            nodeImplementations,
                            settings: {
                                io: { messageReceivers },
                            },
                        }
                    )

                assert.ok(
                    engine.io.messageReceivers.someNode1!.someInlet1 instanceof
                        Function
                )

                assert.ok(!engine.testMessageReceived())
                engine.io.messageReceivers.someNode1!.someInlet1!([
                    666,
                    'n4t4s',
                ])
                engine.io.messageReceivers.someNode1!.someInlet2!([
                    666,
                    'n4t4s',
                ])
                engine.io.messageReceivers.someNode2!.someInlet1!([
                    666,
                    'n4t4s',
                ])
                assert.ok(engine.testMessageReceived())
            }
        )
    })

    describe('messages', () => {
        it.each(TEST_PARAMETERS)(
            'should send a message through graph with multiple / single connections %s',
            async ({ target, bitDepth }) => {
                const graph = makeGraph({
                    node1: {
                        type: 'someNodeType',
                        isPushingMessages: true,
                        inlets: {
                            '0': { type: 'message', id: '0' },
                        },
                        outlets: {
                            '0': { type: 'message', id: '0' },
                            '1': { type: 'message', id: '1' },
                        },
                        sinks: {
                            // Outlet 0 connected to 2 different sinks
                            '0': [
                                ['node2', '0'],
                                ['node2', '1'],
                            ],

                            // Outlet 1 connected to a single sink
                            '1': [['node2', '0']],
                        },
                    },
                    node2: {
                        type: 'someNodeType',
                        inlets: {
                            '0': { type: 'message', id: '0' },
                            '1': { type: 'message', id: '1' },
                        },
                        outlets: {
                            '0': { type: 'message', id: '0' },
                            '1': { type: 'message', id: '1' },
                        },
                    },
                })

                const messageReceivers: IoMessageSpecs = {
                    node1: ['0'],
                }

                const messageSenders: IoMessageSpecs = {
                    node2: ['0', '1'],
                }

                const nodeImplementations: NodeImplementations = {
                    someNodeType: {
                        messageReceivers: ({ snds }, { msg }) => ({
                            '0': AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )`${snds['0']!}(m);return`,
                            '1': AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )`${snds['1']!}(m);return`,
                        }),
                    },
                }

                const engine = await initializeEngineTest(target, bitDepth, {
                    settings: {
                        io: {
                            messageReceivers,
                            messageSenders,
                        },
                    },
                    graph,
                    nodeImplementations,
                })

                const calledOutlet0: Array<Message> = []
                const calledOutlet1: Array<Message> = []
                engine.io.messageSenders.node2!['0']! = (m) =>
                    calledOutlet0.push(m)
                engine.io.messageSenders.node2!['1']! = (m) =>
                    calledOutlet1.push(m)

                engine.io.messageReceivers.node1!['0']!([123, 'bla', 456])
                assert.deepStrictEqual(calledOutlet0, [[123, 'bla', 456]])
                assert.deepStrictEqual(calledOutlet1, [[123, 'bla', 456]])
            }
        )

        it.each(TEST_PARAMETERS)(
            'should thrown an error for unsupported message %s',
            async ({ target, bitDepth }) => {
                const graph = makeGraph({
                    someNode: {
                        type: 'someNodeType',
                        isPushingMessages: true,
                        inlets: {
                            someInlet: { type: 'message', id: 'someInlet' },
                        },
                    },
                })

                const messageReceivers: IoMessageSpecs = {
                    someNode: ['someInlet'],
                }

                const nodeImplementations: NodeImplementations = {
                    someNodeType: {
                        messageReceivers: (_, { msg }) => ({
                            // No return so an error will be thrown
                            someInlet: AnonFunc(
                                [Var(msg.Message, `m`)],
                                'void'
                            )``,
                        }),
                    },
                }

                const engine = await initializeEngineTest(target, bitDepth, {
                    graph,
                    nodeImplementations,
                    settings: {
                        io: {
                            messageReceivers,
                        },
                    },
                })

                await expect(() =>
                    engine.io.messageReceivers.someNode!.someInlet!([
                        123,
                        'bla',
                    ])
                ).toThrow(
                    /Node \"someNode\", inlet \"someInlet\", unsupported message : \[123(.0)*, "bla"\]( at [0-9]+:[0-9]+)?/
                )
            }
        )
    })
})
