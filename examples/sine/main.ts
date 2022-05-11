import * as evalEngine from '@webpd/engine-core/src/eval-engine'
import { ENGINE_ARRAYS_VARIABLE_NAME } from '@webpd/engine-core/src/eval-engine/constants'
import { createButton } from '@webpd/shared/example-helpers'
import compile from '../../src/compile'
import pEvent from 'p-event'
import DEFAULT_REGISTRY from '@webpd/dsp-graph/src/default-registry'
import NODE_IMPLEMENTATIONS from '../../src/nodes'

const context = new AudioContext()

const oscLeftArgs = {
    frequency: 440,
}
const oscRightArgs = {
    frequency: 330,
}

const graph: PdDspGraph.Graph = {
    oscLeft: {
        id: 'oscLeft',
        type: 'osc~',
        args: oscLeftArgs,
        sinks: {
            '0': [{ nodeId: 'dac', portletId: '0' }],
        },
        sources: {},
        inlets: DEFAULT_REGISTRY['osc~'].buildInlets(oscLeftArgs),
        outlets: DEFAULT_REGISTRY['osc~'].buildOutlets(oscLeftArgs),
    },
    oscRight: {
        id: 'oscRight',
        type: 'osc~',
        args: oscRightArgs,
        sinks: {
            '0': [{ nodeId: 'dac', portletId: '1' }],
        },
        sources: {},
        inlets: DEFAULT_REGISTRY['osc~'].buildInlets(oscRightArgs),
        outlets: DEFAULT_REGISTRY['osc~'].buildOutlets(oscRightArgs),
    },
    dac: {
        id: 'dac',
        type: 'dac~',
        args: {},
        sinks: {},
        sources: {
            '0': [{ nodeId: 'oscLeft', portletId: '0' }],
            '1': [{ nodeId: 'oscRight', portletId: '1' }],
        },
        isEndSink: true,
        inlets: DEFAULT_REGISTRY['dac~'].buildInlets({}),
        outlets: DEFAULT_REGISTRY['dac~'].buildOutlets({}),
    },
}

const main = async () => {
    let engine = await evalEngine.create(context, {
        sampleRate: context.sampleRate,
        channelCount: 2,
    })
    const button = createButton('Start')
    await pEvent(button, 'click')
    engine = await evalEngine.init(engine)

    const code = await compile(graph, NODE_IMPLEMENTATIONS, {
        sampleRate: 44100,
        channelCount: 2,
        arraysVariableName: ENGINE_ARRAYS_VARIABLE_NAME,
    })
    await evalEngine.run(engine, code, {})
    return engine
}

main().then((engine) => {
    console.log('app started')
    ;(window as any).webPdEngine = engine
})
