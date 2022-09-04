/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { jest } from '@jest/globals'
import assert from 'assert'
import { round } from '../test-helpers'
import { CompilerSettingsWithDefaults, NodeImplementations, PortSpecs } from '../types'
import compileToAssemblyscript from './compile-to-assemblyscript'
import { compileWasmModule } from './test-helpers'
import { AssemblyScriptWasmExports } from './types'
import { createEngine } from './assemblyscript-wasm-bindings'
import { makeGraph } from '@webpd/shared/test-helpers'
import { generateInletVariableName } from '../variable-names'
import { Compilation, generateEngineVariableNames, wrapMacros } from '../compilation'
import MACROS from './macros'

describe('compileToAssemblyscript', () => {
    jest.setTimeout(10000)

    const COMPILER_SETTINGS: CompilerSettingsWithDefaults = {
        channelCount: 2,
        target: 'assemblyscript',
        bitDepth: 32,
        portSpecs: {},
        messageListenerSpecs: {},
    }

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'DUMMY': {
            loop: () => `// [DUMMY] loop`,       
        },
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
    }

    const filterPortFunctionKeys = (wasmExports: any) =>
        Object.keys(wasmExports).filter(
            (key) => key.startsWith('read_') || key.startsWith('write_')
        )

    const compileWasmExports = async (
        graph: PdDspGraph.Graph, 
        settings: CompilerSettingsWithDefaults, 
        extraCode: string = ''
    ) => {
        const compilation: Compilation = {
            graph, 
            nodeImplementations: NODE_IMPLEMENTATIONS, 
            settings,
            macros: MACROS,
            variableNames: generateEngineVariableNames(NODE_IMPLEMENTATIONS, graph)
        }
        const code = compileToAssemblyscript(compilation)
        const wasmModule = await compileWasmModule(`${extraCode}\n${code}`)
        const engine = await createEngine(wasmModule, settings)
        return engine.wasmExports as any
    }

    it('should create the specified ports', async () => {
        const settings: CompilerSettingsWithDefaults = {
            ...COMPILER_SETTINGS,
            portSpecs: {
                bla: { access: 'r', type: 'float' },
                blo: { access: 'w', type: 'messages' },
                bli: { access: 'rw', type: 'float' },
                blu: { access: 'rw', type: 'messages' },
            } as PortSpecs,
        }
        const wasmExports = await compileWasmExports({}, settings, 
            // prettier-ignore
            `
                let bla: f32 = 1
                let blo: Message[]
                let bli: f32 = 2
                let bluMessage1: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING, 4 ])
                let bluMessage2: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT ])
                let blu: Message[] = [bluMessage1, bluMessage2]
                let blu2: Message[] = [bluMessage2]

                export function getBlu2(): Message[] {
                    return blu2
                }
                export function getBluMessage1(): Message {
                    return bluMessage1
                }
                export function getBluMessage2(): Message {
                    return bluMessage2
                }
            `
        )

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_bla',
                'write_blo',
                'read_bli',
                'write_bli',
                'read_blu_length',
                'read_blu_elem',
                'write_blu',
            ].sort()
        )

        assert.strictEqual(wasmExports.read_bla(), 1)

        assert.strictEqual(wasmExports.read_bli(), 2)
        wasmExports.write_bli(666.666)
        assert.strictEqual(round(wasmExports.read_bli()), 666.666)

        assert.deepStrictEqual(wasmExports.read_blu_length(), 2)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage1()
        )
        assert.strictEqual(
            wasmExports.read_blu_elem(1),
            wasmExports.getBluMessage2()
        )

        const blu2Pointer = wasmExports.getBlu2()
        wasmExports.write_blu(blu2Pointer)
        assert.deepStrictEqual(wasmExports.read_blu_length(), 1)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage2()
        )
    })

    it('should create extra read ports for inlet listeners', async () => {
        const settings = {
            ...COMPILER_SETTINGS,
            messageListenerSpecs: {'bla': () => {}},
            portSpecs: {
                'blo': {
                    access: 'r',
                    type: 'float'
                }
            } as PortSpecs,
        }
        const graph = makeGraph({
            'someNode': {
                isEndSink: true,
                inlets: {'someInlet': { type: 'control', id: 'someInlet' }}
            }
        })
        const wasmExports = await compileWasmExports(graph, settings, `
            let bla: Message[] = []
            let blo: f32 = 7
        `)

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_bla_length',
                'read_bla_elem',
                'read_blo',
            ].sort()
        )
    })

    it('should create inlet listeners and trigger them whenever inlets receive new messages', async () => {
        const called: Array<Array<PdSharedTypes.ControlValue>> = []
        const inletVariableName = generateInletVariableName('someNode', 'someInlet')
        const settings = {
            ...COMPILER_SETTINGS,
            messageListenerSpecs: {
                [inletVariableName]: (messages: Array<PdSharedTypes.ControlValue>) => called.push(messages)
            },
            portSpecs: {
                [inletVariableName]: {
                    access: 'r',
                    type: 'messages'
                }
            } as PortSpecs,
        }

        const nodeImplementations: NodeImplementations = {
            'messageGeneratorType': {
                loop: (_, {outs, globs, MACROS}) => `
                    if (${globs.frame} % 5 === 0) {
                        ${MACROS.createMessage('m', [0])}
                        writeFloatDatum(m, 0, f32(${globs.frame}))
                        ${outs.someOutlet}.push(m)
                    }
                `
            },
            'someNodeType': {
                loop: () => ``
            }
        }

        const graph = makeGraph({
            'messageGenerator': {
                type: 'messageGeneratorType',
                outlets: {'someOutlet': { type: 'control', id: 'someOutlet' }},
                sinks: {'someOutlet': [['someNode', 'someInlet']]}
            },
            'someNode': {
                type: 'someNodeType',
                isEndSink: true,
                inlets: {'someInlet': { type: 'control', id: 'someInlet' }}
            }
        })

        const compilation: Compilation = {
            graph, 
            nodeImplementations, 
            settings,
            macros: MACROS,
            variableNames: generateEngineVariableNames(nodeImplementations, graph)
        }
        const code = compileToAssemblyscript(compilation)
        const wasmModule = await compileWasmModule(code)
        const engine = await createEngine(wasmModule, settings)

        const blockSize = 18
        engine.configure(44100, blockSize)
        engine.loop()
        assert.deepStrictEqual(called, [
            [[0]],[[5]],[[10]],[[15]],
        ])
    })

    it('should create the specified ports', async () => {
        const settings = {
            ...COMPILER_SETTINGS,
            portSpecs: {
                bla: { access: 'r', type: 'float' },
                blo: { access: 'w', type: 'messages' },
                bli: { access: 'rw', type: 'float' },
                blu: { access: 'rw', type: 'messages' },
            } as PortSpecs,
        }
        const wasmExports = await compileWasmExports({}, settings, 
            // prettier-ignore
            `
                let bla: f32 = 1
                let blo: Message[]
                let bli: f32 = 2
                let bluMessage1: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT, MESSAGE_DATUM_TYPE_STRING, 4 ])
                let bluMessage2: Message = Message.fromTemplate([ MESSAGE_DATUM_TYPE_FLOAT ])
                let blu: Message[] = [bluMessage1, bluMessage2]
                let blu2: Message[] = [bluMessage2]

                export function getBlu2(): Message[] {
                    return blu2
                }
                export function getBluMessage1(): Message {
                    return bluMessage1
                }
                export function getBluMessage2(): Message {
                    return bluMessage2
                }
            `
        )

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_bla',
                'write_blo',
                'read_bli',
                'write_bli',
                'read_blu_length',
                'read_blu_elem',
                'write_blu',
            ].sort()
        )

        assert.strictEqual(wasmExports.read_bla(), 1)

        assert.strictEqual(wasmExports.read_bli(), 2)
        wasmExports.write_bli(666.666)
        assert.strictEqual(round(wasmExports.read_bli()), 666.666)

        assert.deepStrictEqual(wasmExports.read_blu_length(), 2)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage1()
        )
        assert.strictEqual(
            wasmExports.read_blu_elem(1),
            wasmExports.getBluMessage2()
        )

        const blu2Pointer = wasmExports.getBlu2()
        wasmExports.write_blu(blu2Pointer)
        assert.deepStrictEqual(wasmExports.read_blu_length(), 1)
        assert.strictEqual(
            wasmExports.read_blu_elem(0),
            wasmExports.getBluMessage2()
        )
    })

    it('should combine extra read ports with port specs for inlet listeners', async () => {
        const settings = {
            ...COMPILER_SETTINGS,
            messageListenerSpecs: {
                'bla': () => {},
                'blo': () => {},
            },
            portSpecs: {
                'bla': {access: 'w', type: 'messages'},
                'blo': {access: 'r', type: 'messages'},
            } as PortSpecs,
        }
        const wasmExports = await compileWasmExports({}, settings, `
            let bla: Message[] = []
            let blo: Message[] = []
        `)

        assert.deepStrictEqual(
            filterPortFunctionKeys(wasmExports).sort(),
            [
                'read_bla_length',
                'read_bla_elem',
                'write_bla',
                'read_blo_length',
                'read_blo_elem',
            ].sort()
        )
    })

    it('should throw error when incompatible with portSpec', async () => {
        const settings = {
            ...COMPILER_SETTINGS,
            messageListenerSpecs: {
                'bla': () => {},
            },
            portSpecs: {
                'bla': {access: 'w', type: 'float'},
            } as PortSpecs,
        }
        const compilation: Compilation = {
            graph: {}, 
            nodeImplementations: NODE_IMPLEMENTATIONS, 
            settings,
            macros: MACROS,
            variableNames: generateEngineVariableNames(NODE_IMPLEMENTATIONS, {})
        }
        assert.throws(() => compileToAssemblyscript(compilation))
    })

    it('should be a wasm engine when compiled', async () => {
        const wasmExports = await compileWasmExports({}, COMPILER_SETTINGS)

        const expectedExports: AssemblyScriptWasmExports = {
            configure: (_: number) => 0,
            loop: () => new Float32Array(),
            setArray: () => undefined,
            memory: new WebAssembly.Memory({ initial: 128 }),
            MESSAGE_DATUM_TYPE_FLOAT: new WebAssembly.Global({ value: 'i32' }),
            MESSAGE_DATUM_TYPE_STRING: new WebAssembly.Global({ value: 'i32' }),
            createMessage: () => 0,
            getMessageDatumTypes: () => 0,
            createMessageArray: () => 0,
            pushMessageToArray: () => undefined,
            writeStringDatum: () => undefined,
            writeFloatDatum: () => undefined,
            readStringDatum: () => 0,
            readFloatDatum: () => 0,
            __new: () => 0,
        }

        // Plenty of low-level exported function are added by asc compiler when using
        // option 'export-runtime'
        const exportsIgnoredKeys = [
            '__collect',
            '__pin',
            '__rtti_base',
            '__unpin',
        ]

        const actualExportsKeys = Object.keys(wasmExports).filter(
            (key) => !exportsIgnoredKeys.includes(key)
        )

        assert.deepStrictEqual(
            actualExportsKeys.sort(),
            Object.keys(expectedExports).sort()
        )
    })
})
