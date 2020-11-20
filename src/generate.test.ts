import assert from 'assert'
import generate, { generateSetupAndLoop } from './generate'
import { makeGraph, makeRegistry } from '@webpd/shared/test-helpers'

describe('generate', () => {
    const JS_EVAL_SETTINGS = {
        sampleRate: 44100,
        channelCount: 2,
        engineOutputVariableNames: ['ENGINE_OUTPUT1', 'ENGINE_OUTPUT2'],
    }

    const REGISTRY = makeRegistry({
        'osc~': {
            inletTypes: ['control', 'signal'],
            outletTypes: ['signal'],
        },
        'dac~': {
            isSink: true,
            inletTypes: ['signal', 'signal'],
            outletTypes: [],
        },
    })

    const normalizeCode = (rawCode: string) => {
        const lines = rawCode
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => !!line.length)
        return lines.join('\n')
    }

    it('should generate the full function as a string', async () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
                sinks: {
                    0: [['dac', '0']],
                },
            },
            dac: {
                type: 'dac~',
            },
        })
        const dspFunction = await generate(graph, REGISTRY, JS_EVAL_SETTINGS)

        assert.strictEqual(
            normalizeCode(dspFunction),
            normalizeCode(`
            let osc_STATE_phase = 0
            let osc_STATE_J = 2 * Math.PI / 44100
            let osc_INS_0 = 440
            let osc_OUTS_0 = 0
            
            let dac_INS_0 = 0
            let dac_INS_1 = 0
        
            return () => {
                osc_STATE_phase += osc_STATE_phase * osc_INS_0
                osc_OUTS_0 = Math.cos(osc_STATE_phase)
    
                dac_INS_0 = osc_OUTS_0
    
                ENGINE_OUTPUT1 = dac_INS_0
                ENGINE_OUTPUT2 = dac_INS_1
                
                return [ENGINE_OUTPUT1, ENGINE_OUTPUT2]
            }
        `)
        )
    })

    describe('generateSetupAndLoop', () => {
        it('should generate the setup / loop function', async () => {
            const graph = makeGraph({
                oscFreqMod: {
                    type: 'osc~',
                    sinks: {
                        0: [['oscMain', '0']],
                    },
                    args: {
                        frequency: 440,
                    },
                },
                oscMain: {
                    type: 'osc~',
                    sinks: {
                        0: [['dac', '0']],
                    },
                    args: {
                        frequency: 550,
                    },
                },
                dac: {
                    type: 'dac~',
                },
            })
            const registry = makeRegistry({
                'osc~': {
                    inletTypes: ['control', 'signal'],
                    outletTypes: ['signal'],
                },
                'dac~': {
                    isSink: true,
                    inletTypes: ['signal', 'signal'],
                    outletTypes: [],
                },
            })
            const { setup, loop } = await generateSetupAndLoop(
                graph,
                registry,
                JS_EVAL_SETTINGS
            )

            assert.strictEqual(
                normalizeCode(setup),
                normalizeCode(`
                let oscFreqMod_STATE_phase = 0
                let oscFreqMod_STATE_J = 2 * Math.PI / 44100
                let oscFreqMod_INS_0 = 440
                let oscFreqMod_OUTS_0 = 0

                let oscMain_STATE_phase = 0
                let oscMain_STATE_J = 2 * Math.PI / 44100
                let oscMain_INS_0 = 550
                let oscMain_OUTS_0 = 0
                
                let dac_INS_0 = 0
                let dac_INS_1 = 0
            `)
            )

            assert.strictEqual(
                normalizeCode(loop),
                normalizeCode(`
                oscFreqMod_STATE_phase += oscFreqMod_STATE_phase * oscFreqMod_INS_0
                oscFreqMod_OUTS_0 = Math.cos(oscFreqMod_STATE_phase)
            
                oscMain_INS_0 = oscFreqMod_OUTS_0

                oscMain_STATE_phase += oscMain_STATE_phase * oscMain_INS_0
                oscMain_OUTS_0 = Math.cos(oscMain_STATE_phase)

                dac_INS_0 = oscMain_OUTS_0

                ENGINE_OUTPUT1 = dac_INS_0
                ENGINE_OUTPUT2 = dac_INS_1
            `)
            )
        })
    })
})
