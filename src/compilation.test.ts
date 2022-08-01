import { makeGraph } from '@webpd/shared/test-helpers'
import { NodeImplementations, CompilerSettings } from './types'
import { Compilation, validateSettings } from './compilation'
import assert from 'assert'
import {
    generateInletVariableName,
    generateOutletVariableName,
    generateStateVariableName,
} from './variable-names'

describe('compilation', () => {
    const COMPILER_SETTINGS: CompilerSettings = {
        channelCount: 2,
        target: 'javascript',
    }

    describe('Compilation', () => {
        it('should create variable names for nodes', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    setup: () => `// [osc~] setup`,
                    loop: () => `// [osc~] loop`,
                    stateVariables: ['phase', 'currentThing', 'k'],
                },
                'dac~': {
                    setup: () => `// [dac~] setup`,
                    loop: () => `// [dac~] loop`,
                },
            }

            const graph = makeGraph({
                myOsc: {
                    type: 'osc~',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'control', id: '1' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                        '1': { type: 'control', id: '1' },
                    },
                },
                myDac: {
                    type: 'dac~',
                },
            })

            const compilation = new Compilation(
                graph,
                nodeImplementations,
                COMPILER_SETTINGS
            )

            assert.deepStrictEqual(
                JSON.parse(JSON.stringify({ ...compilation.variableNames.n })),
                {
                    myOsc: {
                        ins: {
                            '0': generateInletVariableName('myOsc', '0'),
                            '1': generateInletVariableName('myOsc', '1'),
                        },
                        outs: {
                            '0': generateOutletVariableName('myOsc', '0'),
                            '1': generateOutletVariableName('myOsc', '1'),
                        },
                        state: {
                            phase: generateStateVariableName('myOsc', 'phase'),
                            currentThing: generateStateVariableName(
                                'myOsc',
                                'currentThing'
                            ),
                            k: generateStateVariableName('myOsc', 'k'),
                        },
                    },
                    myDac: {
                        ins: {},
                        outs: {},
                        state: {},
                    },
                }
            )
        })

        it('should throw error for unknown namespaces', () => {
            const nodeImplementations: NodeImplementations = {
                'osc~': {
                    setup: () => `// [osc~] setup`,
                    loop: () => `// [osc~] loop`,
                    stateVariables: ['phase'],
                },
            }

            const graph = makeGraph({
                myOsc: {
                    type: 'osc~',
                    inlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                    outlets: {
                        '0': { type: 'signal', id: '0' },
                    },
                },
            })

            const compilation = new Compilation(
                graph,
                nodeImplementations,
                COMPILER_SETTINGS
            )

            assert.throws(() => compilation.variableNames.n.unknownNode)
            assert.throws(
                () => compilation.variableNames.n.myOsc.ins['unknown portlet']
            )
            assert.throws(
                () => compilation.variableNames.n.myOsc.outs['unknown portlet']
            )
            assert.throws(
                () => compilation.variableNames.n.myOsc.state['unknown var']
            )
        })

        it('should bind the macros to pass compilation as first argument', () => {
            const graph = makeGraph({})
            const nodeImplementations: NodeImplementations = {}
            const compilation = new Compilation(graph, nodeImplementations, {
                ...COMPILER_SETTINGS,
                target: 'assemblyscript',
            })
            const MACROS = compilation.getMacros()
            assert.strictEqual(MACROS.typedVarFloat('bla'), 'bla: f32')
        })
    })

    describe('validateSettings', () => {
        it('should validate settings and set defaults', () => {
            const settings = validateSettings({
                target: 'assemblyscript',
                channelCount: 2,
            })
            assert.strictEqual((settings as any).bitDepth, 32)
            assert.deepStrictEqual((settings as any).portSpecs, {})
        })

        it('should throw error if settings invalid', () => {
            assert.throws(() =>
                validateSettings({
                    target: 'assemblyscript',
                    channelCount: 2,
                    sampleRate: 44100,
                    bitDepth: 666,
                } as any)
            )
        })
    })
})
