import assert from 'assert'
import generate from './generate'
import {makeGraph, makeRegistry} from '@webpd/shared/test-helpers'

const SETTINGS = { sampleRate: 44100, channelCount: 2, engineOutputVariableNames: ['ENGINE_OUTPUT1', 'ENGINE_OUTPUT2'] }

describe('generate', () => {

    const normalizeCode = (rawCode: string) => {
        const lines = rawCode.split('\n')
            .map(line => line.trim())
            .filter(line => !!line.length)
        return lines.join('\n')
    }

    it('should generate the setup / loop function', async () => {
        const graph = makeGraph({
            'oscFreqMod': {
                type: 'osc~',
                sinks: {
                    0: [['oscMain', '0']]
                }
            },
            'oscMain': {
                type: 'osc~',
                sinks: {
                    0: [['dac', '0']]
                }
            },
            'dac': {
                type: 'dac~'
            }
        })
        const registry = makeRegistry({
            'osc~': {
                inletTypes: ['control' as PdRegistry.PortletType, 'signal' as PdRegistry.PortletType],
                outletTypes: ['signal' as PdRegistry.PortletType],
            },
            'dac~': {
                isSink: true,
                inletTypes: ['signal' as PdRegistry.PortletType, 'signal' as PdRegistry.PortletType],
                outletTypes: []
            }
        })
        const {setup, loop} = await generate(graph, registry, SETTINGS)

        assert.strictEqual(normalizeCode(setup), normalizeCode(`
            let oscFreqMod_INS_0 = 0
            let oscFreqMod_INS_1 = 0
            let oscFreqMod_OUTS_0 = 0
            
            let oscFreqMod_STATE_phase = 0
            let oscFreqMod_STATE_J = 2 * Math.PI / 44100
            
            let oscMain_INS_0 = 0
            let oscMain_INS_1 = 0
            let oscMain_OUTS_0 = 0
            
            let oscMain_STATE_phase = 0
            let oscMain_STATE_J = 2 * Math.PI / 44100
            
            let dac_INS_0 = 0
            let dac_INS_1 = 0
        `))

        assert.strictEqual(normalizeCode(loop), normalizeCode(`
            oscFreqMod_STATE_phase += oscFreqMod_STATE_phase * oscFreqMod_INS_0
            oscFreqMod_OUTS_0 = Math.cos(oscFreqMod_STATE_phase)
        
            oscMain_INS_0 = oscFreqMod_OUTS_0

            oscMain_STATE_phase += oscMain_STATE_phase * oscMain_INS_0
            oscMain_OUTS_0 = Math.cos(oscMain_STATE_phase)

            dac_INS_0 = oscMain_OUTS_0

            ENGINE_OUTPUT1 = dac_INS_0
            ENGINE_OUTPUT2 = dac_INS_1
        `))

    })

})