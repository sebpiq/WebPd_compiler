import assert from 'assert'
import compile, { compileLoop, compileSetup } from './compile'
import { makeGraph } from '@webpd/shared/test-helpers'
import { NodeImplementations, PortsNames, CompilerSettings } from './types'
import { buildSignalProcessor } from '@webpd/engine-live-eval/src/utils'
import { Compilation } from './compilation'

describe('compile', () => {
    const COMPILER_SETTINGS: CompilerSettings = {
        sampleRate: 44100,
        channelCount: 2,
        arraysVariableName: 'ARRAYS',
    }

    const normalizeCode = (rawCode: string) => {
        const lines = rawCode
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => !!line.length)
        return lines.join('\n')
    }

    describe('default', () => {
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

            const code = compile(graph, nodeImplementations, COMPILER_SETTINGS)

            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                let o = 0
                let frame = -1
                const isNumber = (v) => typeof v === 'number'
                let PROCESSOR_OUTPUT1 = 0
                let PROCESSOR_OUTPUT2 = 0
                
                let osc_INS_0_control = []
                let osc_OUTS_0 = 0
                // [osc~] setup
                
                let dac_INS_0 = 0
                let dac_INS_1 = 0
                // [dac~] setup

                return {
                    loop: () => { 
                        frame++
                        // [osc~] loop
                        dac_INS_0 = osc_OUTS_0
                        // [dac~] loop

                        if (osc_INS_0_control.length) {
                            osc_INS_0_control = []
                        }
                        
                        return [PROCESSOR_OUTPUT1, PROCESSOR_OUTPUT2]
                    },
                    ports: {
                        getVariable: (variableName) => {
                            return eval(variableName)
                        },
                        setVariable: (variableName, variableValue) => {
                            eval(variableName + ' = variableValue')
                        }
                    }
                }
            `)
            )
        })

        it('should be a signal processor', () => {
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

            const code = compile(graph, nodeImplementations, COMPILER_SETTINGS)

            const modelProcessor: PdEngine.SignalProcessor = {
                loop: () => new Float32Array(),
                ports: {
                    [PortsNames.GET_VARIABLE]: () => null,
                    [PortsNames.SET_VARIABLE]: () => null,
                },
            }

            const processor = buildSignalProcessor(code)

            assert.deepStrictEqual(
                Object.keys(processor),
                Object.keys(modelProcessor)
            )
            assert.deepStrictEqual(
                Object.keys(processor.ports),
                Object.keys(modelProcessor.ports)
            )
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
                COMPILER_SETTINGS
            )

            const setup = compileSetup(compilation, [graph.osc, graph.dac])

            assert.strictEqual(
                normalizeCode(setup),
                normalizeCode(`
                let o = 0
                let frame = -1
                const isNumber = (v) => typeof v === 'number'
                let PROCESSOR_OUTPUT1 = 0
                let PROCESSOR_OUTPUT2 = 0

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
                COMPILER_SETTINGS
            )

            const loop = compileLoop(compilation, [
                graph.msg,
                graph.plus,
                graph.print,
            ])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                frame++
                // [msg] : value 2 ; sample rate 44100
                for (o = 0; o < msg_OUTS_0.length; o++) {
                    plus_INS_0.push(msg_OUTS_0[o])
                }
                for (o = 0; o < msg_OUTS_0.length; o++) {
                    print_INS_0.push(msg_OUTS_0[o])
                }

                // [+] : value 1 ; sample rate 44100
                for (o = 0; o < plus_OUTS_0.length; o++) {
                    print_INS_0.push(plus_OUTS_0[o])
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
                COMPILER_SETTINGS
            )

            const loop = compileLoop(compilation, [
                graph.osc,
                graph.plus,
                graph.dac,
            ])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                frame++
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
                COMPILER_SETTINGS
            )

            const loop = compileLoop(compilation, [graph.osc, graph.dac])

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                frame++
                // [osc~] : frequency 440 ; sample rate 44100
                dac_INS_0 = osc_OUTS_0
                // [dac~] : channelCount 2
            `)
            )
        })
    })
})
