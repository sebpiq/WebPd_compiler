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

import assert from 'assert'
import compile, { compileLoop, compileSetup } from './compile'
import { makeGraph } from '@webpd/shared/test-helpers'
import { NodeImplementations, CompilerSettings } from './types'
import { Compilation } from './compilation'
import { compileAssemblyScript, normalizeCode, round } from './test-helpers'
import { jest } from '@jest/globals'
import { AssemblyScriptWasmEngine } from './engine-assemblyscript/types'
import { JavaScriptEngine } from './engine-javascript/types'

describe('compile', () => {
    jest.setTimeout(10000)

    const COMPILER_SETTINGS_JS: CompilerSettings = {
        sampleRate: 44100,
        channelCount: 2,
        target: 'javascript',
    }

    const COMPILER_SETTINGS_AS: CompilerSettings = {
        sampleRate: 44100,
        channelCount: 2,
        target: 'assemblyscript',
        bitDepth: 32,
    }

    describe('default', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            'osc~': {
                setup: () => `// [osc~] setup`,
                loop: () => `// [osc~] loop`,
            },
            'dac~': {
                setup: () => `// [dac~] setup`,
                loop: () => `// [dac~] loop`,
            },
        }

        describe('target: javascript', () => {
            it('should compile the full function as a string', () => {
                const graph = makeGraph({
                    osc: {
                        type: 'osc~',
                        args: {
                            frequency: 440,
                        },
                        sinks: {
                            0: [['dac', '0']],
                        },
                        inlets: {
                            '0_control': { id: '0_control', type: 'control' },
                        },
                        outlets: { '0': { id: '0', type: 'signal' } },
                    },
                    dac: {
                        type: 'dac~',
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                            '1': { id: '1', type: 'signal' },
                        },
                        isEndSink: true,
                    },
                })

                const code = compile(
                    graph,
                    NODE_IMPLEMENTATIONS,
                    COMPILER_SETTINGS_JS
                )

                assert.strictEqual(
                    normalizeCode(code),
                    normalizeCode(`
                    let F = 0
                    let O = 0
                    let FRAME = -1
                    let BLOCK_SIZE = 0
                    
                    let osc_INS_0_control = []
                    let osc_OUTS_0 = 0
                    // [osc~] setup
                    
                    let dac_INS_0 = 0
                    let dac_INS_1 = 0
                    // [dac~] setup
    
                    return {
                        configure: (blockSize) => {
                            BLOCK_SIZE = blockSize
                        },
                        loop: (OUTPUT) => {
                            for (F = 0; F < BLOCK_SIZE; F++) {
                                FRAME++
                                // [osc~] loop
                                dac_INS_0 = osc_OUTS_0
                                // [dac~] loop
    
                                if (osc_INS_0_control.length) {
                                    osc_INS_0_control = []
                                }
                            }
                        },
                        ports: {
                        }
                    }
                `)
                )
            })

            it('should create the specified ports', () => {
                const code = compile({}, NODE_IMPLEMENTATIONS, {
                    ...COMPILER_SETTINGS_JS,
                    portSpecs: {
                        bla: { access: 'r', type: 'float' },
                        blo: { access: 'w', type: 'messages' },
                        bli: { access: 'rw', type: 'float' },
                        blu: { access: 'rw', type: 'messages' },
                    },
                })
                const engine: JavaScriptEngine = new Function(`
                    let bla = 1
                    let blo = [['bang']]
                    let bli = 2
                    let blu = [[123.123, 'bang']]
                    ${code}
                `)()

                assert.deepStrictEqual(Object.keys(engine.ports), [
                    'read_bla',
                    'write_blo',
                    'read_bli',
                    'write_bli',
                    'read_blu',
                    'write_blu',
                ])

                assert.strictEqual(engine.ports.read_bla(), 1)

                assert.strictEqual(engine.ports.read_bli(), 2)
                engine.ports.write_bli(666.666)
                assert.strictEqual(engine.ports.read_bli(), 666.666)

                const blu = engine.ports.read_blu()
                assert.deepStrictEqual(blu, [[123.123, 'bang']])
                blu.push(['I am blu'])
                assert.deepStrictEqual(engine.ports.read_blu(), [
                    [123.123, 'bang'],
                    ['I am blu'],
                ])
                engine.ports.write_blu([['blurg']])
                assert.deepStrictEqual(engine.ports.read_blu(), [['blurg']])
            })

            it('should be a JavaScript engine when evaled', () => {
                const graph = makeGraph({
                    osc: {
                        type: 'osc~',
                        args: {
                            frequency: 440,
                        },
                        inlets: {
                            '0_control': { id: '0_control', type: 'control' },
                        },
                        outlets: { '0': { id: '0', type: 'signal' } },
                    },
                })

                const code = compile(
                    graph,
                    NODE_IMPLEMENTATIONS,
                    COMPILER_SETTINGS_JS
                )

                const modelEngine: JavaScriptEngine = {
                    configure: (_: number) => {},
                    loop: () => new Float32Array(),
                    ports: {},
                }

                const engine = new Function(code)()

                assert.deepStrictEqual(
                    Object.keys(engine),
                    Object.keys(modelEngine)
                )
            })
        })

        describe('target: assemblyscript', () => {
            it('should compile the full function as a string', () => {
                const nodeImplementations: NodeImplementations = {
                    'osc~': {
                        setup: () => `// [osc~] setup`,
                        loop: () => `// [osc~] loop`,
                    },
                    'dac~': {
                        setup: () => `// [dac~] setup`,
                        loop: () => `// [dac~] loop`,
                    },
                }

                const graph = makeGraph({
                    osc: {
                        type: 'osc~',
                        args: {
                            frequency: 440,
                        },
                        sinks: {
                            0: [['dac', '0']],
                        },
                        inlets: {
                            '0_control': { id: '0_control', type: 'control' },
                        },
                        outlets: { '0': { id: '0', type: 'signal' } },
                    },
                    dac: {
                        type: 'dac~',
                        inlets: {
                            '0': { id: '0', type: 'signal' },
                            '1': { id: '1', type: 'signal' },
                        },
                        isEndSink: true,
                    },
                })

                const code = compile(
                    graph,
                    nodeImplementations,
                    COMPILER_SETTINGS_AS
                )

                assert.strictEqual(
                    normalizeCode(code),
                    normalizeCode(`
                    let OUTPUT: Float32Array = new Float32Array(0)
                    let F: i32 = i32(0)
                    let O: i32 = i32(0)
                    let FRAME: i32 = i32(-1)
                    let BLOCK_SIZE: i32 = i32(0)            
                    
                    let osc_INS_0_control: Message[] = []
                    let osc_OUTS_0: f32 = 0
                    // [osc~] setup
                    
                    let dac_INS_0: f32 = 0
                    let dac_INS_1: f32 = 0
                    // [dac~] setup
    
                    export function configure(blockSize: i32): Float32Array {
                        BLOCK_SIZE = blockSize
                        OUTPUT = new Float32Array(BLOCK_SIZE * 2)
                        return OUTPUT                
                    }
    
                    export function loop(): void {
                        for (F = 0; F < BLOCK_SIZE; F++) {
                            FRAME++
                            // [osc~] loop
                            dac_INS_0 = osc_OUTS_0
                            // [dac~] loop
    
                            if (osc_INS_0_control.length) {
                                osc_INS_0_control = []
                            }
                        }
                    }
                `)
                )
            })

            it('should create the specified ports', async () => {
                const code = compile({}, NODE_IMPLEMENTATIONS, {
                    ...COMPILER_SETTINGS_AS,
                    portSpecs: {
                        bla: { access: 'r', type: 'float' },
                        // 'blo': {access: 'w', type: 'messages'},
                        bli: { access: 'rw', type: 'float' },
                        // 'blu': {access: 'rw', type: 'messages'},
                    },
                })
                const module = await compileAssemblyScript(`
                    let bla: f32 = 1
                    // let blo: Message[] = [['bang']]
                    let bli: f32 = 2
                    // let blu: Message[] = [[123.123, 'bang']]
                    ${code}
                `)
                const moduleExports = (module as any).instance.exports
                // assert.deepStrictEqual(
                //     Object.keys(moduleExports),
                //     ['loop', 'configure', 'read_bla', 'write_blo', 'read_bli', 'write_bli', 'read_blu', 'write_blu']
                // )

                assert.strictEqual(moduleExports.read_bla(), 1)

                assert.strictEqual(moduleExports.read_bli(), 2)
                moduleExports.write_bli(666.666)
                assert.strictEqual(round(moduleExports.read_bli()), 666.666)

                // assert.deepStrictEqual(moduleExports.read_blu(), [[123.123, 'bang']])
                // moduleExports.write_blu([['blurg']])
                // assert.deepStrictEqual(moduleExports.read_blu(), [['blurg']])
            })

            it('should be a wasm engine when compiled', async () => {
                const nodeImplementations: NodeImplementations = {
                    'osc~': {
                        setup: () => `// [osc~] setup`,
                        loop: () => `// [osc~] loop`,
                    },
                }

                const graph = makeGraph({
                    osc: {
                        type: 'osc~',
                        args: {
                            frequency: 440,
                        },
                        inlets: {
                            '0_control': { id: '0_control', type: 'control' },
                        },
                        outlets: { '0': { id: '0', type: 'signal' } },
                    },
                })

                const code = compile(
                    graph,
                    nodeImplementations,
                    COMPILER_SETTINGS_AS
                )

                const modelModule: AssemblyScriptWasmEngine = {
                    configure: (_: number) => {},
                    loop: () => new Float32Array(),
                    memory: new WebAssembly.Memory({ initial: 128 }),
                    MESSAGE_DATUM_TYPE_FLOAT: new WebAssembly.Global(0 as any),
                    MESSAGE_DATUM_TYPE_STRING: new WebAssembly.Global(0 as any),
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

                const module = await compileAssemblyScript(code)

                assert.deepStrictEqual(
                    Object.keys((module as any).instance.exports),
                    Object.keys(modelModule)
                )
            })
        })
    })

    describe('compileSetup', () => {
        it('should compile the setup function', () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                    args: {
                        frequency: 440,
                    },
                    inlets: {
                        '0_control': { id: '0_control', type: 'control' },
                        '0_signal': { id: '0_signal', type: 'signal' },
                    },
                    outlets: { '0': { id: '0', type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                        '1': { id: '1', type: 'signal' },
                    },
                    outlets: {},
                },
            })

            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    setup: (node, _, settings) =>
                        `// [osc~] frequency ${node.args.frequency} ; sample rate ${settings.sampleRate}`,
                    loop: () => ``,
                },
                'dac~': {
                    setup: (_, __, settings) =>
                        `// [dac~] channelCount ${settings.channelCount}`,
                    loop: () => ``,
                },
            }

            const compilation = new Compilation(
                graph,
                nodeImplementations,
                COMPILER_SETTINGS_JS
            )

            const setup = compileSetup(compilation, [graph.osc, graph.dac])

            assert.strictEqual(
                normalizeCode(setup),
                normalizeCode(`
                let F = 0
                let O = 0
                let FRAME = -1
                let BLOCK_SIZE = 0

                let osc_INS_0_control = []
                let osc_INS_0_signal = 0
                let osc_OUTS_0 = 0
                // [osc~] frequency 440 ; sample rate 44100
                
                let dac_INS_0 = 0
                let dac_INS_1 = 0
                // [dac~] channelCount 2
                
            `)
            )
        })
    })

    describe('compileLoop', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            msg: {
                setup: () => ``,
                loop: (node, _, settings) =>
                    `// [msg] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            '+': {
                setup: () => ``,
                loop: (node, _, settings) =>
                    `// [+] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            print: {
                setup: () => ``,
                loop: (node, _, __) =>
                    `// [print] : value "${node.args.value}"`,
            },
            'osc~': {
                setup: () => ``,
                loop: (node, _, settings) =>
                    `// [osc~] : frequency ${node.args.frequency} ; sample rate ${settings.sampleRate}`,
            },
            '+~': {
                setup: () => ``,
                loop: (node, _, settings) =>
                    `// [+~] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            'dac~': {
                setup: () => ``,
                loop: (_, __, settings) =>
                    `// [dac~] : channelCount ${settings.channelCount}`,
            },
        }

        it('should compile the loop function, pass around control messages, and cleanup control inlets and outlets', () => {
            const graph = makeGraph({
                msg: {
                    type: 'msg',
                    sinks: {
                        '0': [
                            ['plus', '0'],
                            ['print', '0'],
                        ],
                    },
                    args: {
                        value: 2,
                    },
                    outlets: { '0': { id: '0', type: 'control' } },
                },
                plus: {
                    type: '+',
                    sinks: {
                        '0': [['print', '0']],
                    },
                    args: {
                        value: 1,
                    },
                    inlets: { '0': { id: '0', type: 'control' } },
                    outlets: { '0': { id: '0', type: 'control' } },
                },
                print: {
                    type: 'print',
                    args: {
                        value: 'bla',
                    },
                    inlets: { '0': { id: '0', type: 'control' } },
                },
            })

            const compilation = new Compilation(
                graph,
                NODE_IMPLEMENTATIONS,
                COMPILER_SETTINGS_JS
            )

            const loop = compileLoop(compilation, [
                graph.msg,
                graph.plus,
                graph.print,
            ])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                // [msg] : value 2 ; sample rate 44100
                for (O = 0; O < msg_OUTS_0.length; O++) {
                    plus_INS_0.push(msg_OUTS_0[O])
                }
                for (O = 0; O < msg_OUTS_0.length; O++) {
                    print_INS_0.push(msg_OUTS_0[O])
                }

                // [+] : value 1 ; sample rate 44100
                for (O = 0; O < plus_OUTS_0.length; O++) {
                    print_INS_0.push(plus_OUTS_0[O])
                }

                // [print] : value "bla"

                if (msg_OUTS_0.length) {
                    msg_OUTS_0 = []
                }
                if (plus_INS_0.length) {
                    plus_INS_0 = []
                }
                if (plus_OUTS_0.length) {
                    plus_OUTS_0 = []
                }
                if (print_INS_0.length) {
                    print_INS_0 = []
                }
            `)
            )
        })

        it('should compile the loop function and pass around signal', () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                    sinks: {
                        '0': [
                            ['plus', '0'],
                            ['dac', '0'],
                        ],
                    },
                    args: {
                        frequency: 440,
                    },
                    outlets: { '0': { id: '0', type: 'signal' } },
                },
                plus: {
                    type: '+~',
                    sinks: {
                        '0': [['dac', '1']],
                    },
                    args: {
                        value: 110,
                    },
                    inlets: { '0': { id: '0', type: 'signal' } },
                    outlets: { '0': { id: '0', type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    args: {
                        value: 'bla',
                    },
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                        '1': { id: '1', type: 'signal' },
                    },
                },
            })

            const compilation = new Compilation(
                graph,
                NODE_IMPLEMENTATIONS,
                COMPILER_SETTINGS_JS
            )

            const loop = compileLoop(compilation, [
                graph.osc,
                graph.plus,
                graph.dac,
            ])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                // [osc~] : frequency 440 ; sample rate 44100
                plus_INS_0 = osc_OUTS_0
                dac_INS_0 = osc_OUTS_0
            
                // [+~] : value 110 ; sample rate 44100
                dac_INS_1 = plus_OUTS_0

                // [dac~] : channelCount 2
            `)
            )
        })

        it('should omit operations for nodes not connected to an end sink, even if their source is', () => {
            const graph = makeGraph({
                // [osc~] is connected to end sink [dac~] AND to [+~]
                // But [+~] isn't connected to [dac~] and therefore should be entirely
                // omited from compilation.
                osc: {
                    type: 'osc~',
                    sinks: {
                        '0': [
                            ['plus', '0'],
                            ['dac', '0'],
                        ],
                    },
                    args: {
                        frequency: 440,
                    },
                    outlets: { '0': { id: '0', type: 'signal' } },
                },
                plus: {
                    type: '+~',
                    sinks: {},
                    args: {
                        value: 110,
                    },
                    inlets: { '0': { id: '0', type: 'signal' } },
                    outlets: { '0': { id: '0', type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    args: {
                        value: 'bla',
                    },
                    inlets: {
                        '0': { id: '0', type: 'signal' },
                        '1': { id: '1', type: 'signal' },
                    },
                },
            })

            const compilation = new Compilation(
                graph,
                NODE_IMPLEMENTATIONS,
                COMPILER_SETTINGS_JS
            )

            const loop = compileLoop(compilation, [graph.osc, graph.dac])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                // [osc~] : frequency 440 ; sample rate 44100
                dac_INS_0 = osc_OUTS_0
                // [dac~] : channelCount 2
            `)
            )
        })
    })
})
