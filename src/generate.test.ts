import assert from 'assert'
import generate, { generateLoop, generateSetup } from './generate'
import { makeGraph } from '@webpd/shared/test-helpers'
import {
    ProcessorSettings,
    NodeImplementations,
    VariableNameGenerators,
    PortsNames,
} from './types'
import { buildSignalProcessor } from '@webpd/engine-core/src/eval-engine/utils'
import {
    EngineSettings,
    SignalProcessor,
} from '@webpd/engine-core/src/eval-engine/types'

describe('generate', () => {
    const ENGINE_SETTINGS: EngineSettings = {
        sampleRate: 44100,
        channelCount: 2,
    }

    const PROCESSOR_SETTINGS: ProcessorSettings = {
        ...ENGINE_SETTINGS,
        variableNames: {
            output: ['PROCESSOR_OUTPUT1', 'PROCESSOR_OUTPUT2'],
            arrays: 'ARRAYS',
        },
    }

    const normalizeCode = (rawCode: string) => {
        const lines = rawCode
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => !!line.length)
        return lines.join('\n')
    }

    describe('default', () => {
        it('should generate the full function as a string', async () => {
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
                    inlets: { '0_control': { type: 'control' } },
                    outlets: { '0': { type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    inlets: {
                        '0': { type: 'signal' },
                        '1': { type: 'signal' },
                    },
                    isEndSink: true,
                },
            })

            const code = await generate(
                graph,
                nodeImplementations,
                ENGINE_SETTINGS
            )

            assert.strictEqual(
                normalizeCode(code),
                normalizeCode(`
                let o = 0
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

        it('should be a signal processor', async () => {
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
                    inlets: { '0_control': { type: 'control' } },
                    outlets: { '0': { type: 'signal' } },
                },
            })

            const code = await generate(
                graph,
                nodeImplementations,
                ENGINE_SETTINGS
            )

            const modelProcessor: SignalProcessor = {
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

    describe('generateSetup', () => {
        it('should generate the setup function', async () => {
            const graph = makeGraph({
                osc: {
                    type: 'osc~',
                    args: {
                        frequency: 440,
                    },
                    inlets: {
                        '0_control': { type: 'control' },
                        '0_signal': { type: 'signal' },
                    },
                    outlets: { '0': { type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    inlets: {
                        '0': { type: 'signal' },
                        '1': { type: 'signal' },
                    },
                    outlets: {},
                },
            })

            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    setup: (
                        node: PdDspGraph.Node,
                        _: VariableNameGenerators,
                        settings: ProcessorSettings
                    ) =>
                        `// [osc~] frequency ${node.args.frequency} ; sample rate ${settings.sampleRate}`,
                    loop: () => ``,
                },
                'dac~': {
                    setup: (
                        _: PdDspGraph.Node,
                        __: VariableNameGenerators,
                        settings: ProcessorSettings
                    ) => `// [dac~] channelCount ${settings.channelCount}`,
                    loop: () => ``,
                },
            }

            const setup = await generateSetup(
                [graph.osc, graph.dac],
                nodeImplementations,
                PROCESSOR_SETTINGS
            )

            assert.strictEqual(
                normalizeCode(setup),
                normalizeCode(`
                let o = 0
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

    describe('generateLoop', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            msg: {
                setup: () => ``,
                loop: (
                    node: PdDspGraph.Node,
                    _: VariableNameGenerators,
                    settings: ProcessorSettings
                ) =>
                    `// [msg] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            '+': {
                setup: () => ``,
                loop: (
                    node: PdDspGraph.Node,
                    _: VariableNameGenerators,
                    settings: ProcessorSettings
                ) =>
                    `// [+] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            print: {
                setup: () => ``,
                loop: (
                    node: PdDspGraph.Node,
                    _: VariableNameGenerators,
                    __: ProcessorSettings
                ) => `// [print] : value "${node.args.value}"`,
            },
            'osc~': {
                setup: () => ``,
                loop: (
                    node: PdDspGraph.Node,
                    _: VariableNameGenerators,
                    settings: ProcessorSettings
                ) =>
                    `// [osc~] : frequency ${node.args.frequency} ; sample rate ${settings.sampleRate}`,
            },
            '+~': {
                setup: () => ``,
                loop: (
                    node: PdDspGraph.Node,
                    _: VariableNameGenerators,
                    settings: ProcessorSettings
                ) =>
                    `// [+~] : value ${node.args.value} ; sample rate ${settings.sampleRate}`,
            },
            'dac~': {
                setup: () => ``,
                loop: (
                    _: PdDspGraph.Node,
                    __: VariableNameGenerators,
                    settings: ProcessorSettings
                ) => `// [dac~] : channelCount ${settings.channelCount}`,
            },
        }

        it('should generate the loop function, pass around control messages, and cleanup control inlets and outlets', async () => {
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
                    outlets: { '0': { type: 'control' } },
                },
                plus: {
                    type: '+',
                    sinks: {
                        '0': [['print', '0']],
                    },
                    args: {
                        value: 1,
                    },
                    inlets: { '0': { type: 'control' } },
                    outlets: { '0': { type: 'control' } },
                },
                print: {
                    type: 'print',
                    args: {
                        value: 'bla',
                    },
                    inlets: { '0': { type: 'control' } },
                },
            })

            const loop = await generateLoop(
                [graph.msg, graph.plus, graph.print],
                NODE_IMPLEMENTATIONS,
                PROCESSOR_SETTINGS
            )

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
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

        it('should generate the loop function and pass around signal', async () => {
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
                    outlets: { '0': { type: 'signal' } },
                },
                plus: {
                    type: '+~',
                    sinks: {
                        '0': [['dac', '1']],
                    },
                    args: {
                        value: 110,
                    },
                    inlets: { '0': { type: 'signal' } },
                    outlets: { '0': { type: 'signal' } },
                },
                dac: {
                    type: 'dac~',
                    args: {
                        value: 'bla',
                    },
                    inlets: {
                        '0': { type: 'signal' },
                        '1': { type: 'signal' },
                    },
                },
            })

            const loop = await generateLoop(
                [graph.osc, graph.plus, graph.dac],
                NODE_IMPLEMENTATIONS,
                PROCESSOR_SETTINGS
            )

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
    })
})
