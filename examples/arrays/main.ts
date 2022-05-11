import * as evalEngine from '@webpd/engine-core/src/eval-engine'
import {createButton} from '@webpd/shared/example-helpers'
import generate from '../../src/generate'
import pEvent from 'p-event'
import DEFAULT_REGISTRY from '@webpd/dsp-graph/src/default-registry'
import NODE_IMPLEMENTATIONS from '../../src/nodes'
import { sendMessage } from '../../src/api'
import { Engine } from '@webpd/engine-core/src/eval-engine/types'

const SAMPLE_URL = '/sample.mp3'
const CONTEXT = new AudioContext()
const TABPLAY_ID = 'tabplay'
const SAMPLE_ARRAY_NAME = 'SAMPLE'

const tabplayArgs = {arrayName: SAMPLE_ARRAY_NAME}
const graph: PdDspGraph.Graph = {
    'tabplay': {
        id: TABPLAY_ID,
        type: 'tabplay~',
        args: tabplayArgs,
        sinks: {
            '0': [{nodeId: 'dac', portletId: '0'}]
        },
        sources: {},
        inlets: DEFAULT_REGISTRY['osc~'].buildInlets(tabplayArgs),
        outlets: DEFAULT_REGISTRY['osc~'].buildOutlets(tabplayArgs)
    },
    'dac': {
        id: 'dac',
        type: 'dac~',
        args: {},
        sinks: {},
        sources: {
            '0': [{nodeId: 'oscLeft', portletId: '0'}],
            '1': [{nodeId: 'oscRight', portletId: '1'}],
        },
        isEndSink: true,
        inlets: DEFAULT_REGISTRY['dac~'].buildInlets({}),
        outlets: DEFAULT_REGISTRY['dac~'].buildOutlets({})
    }
}

const loadSample = async (audioContext: AudioContext) => {
    const response = await fetch(SAMPLE_URL)
    const audioData = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(audioData)
    const arrays: Array<Float32Array> = []
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        arrays.push(audioBuffer.getChannelData(ch))
    }
    return arrays
}

const bangTabPlay = (engine: Engine) => {
    sendMessage(engine, TABPLAY_ID, '0', ['bang'])
}

const main = async () => {
    let engine = await evalEngine.create(CONTEXT, {
        sampleRate: CONTEXT.sampleRate, 
        channelCount: 2,
    })
    const button = createButton('Start')
    const sampleArrays = await loadSample(CONTEXT)
    await pEvent(button, 'click')
    engine = await evalEngine.init(engine)

    const code = await generate(graph, NODE_IMPLEMENTATIONS, {
        sampleRate: 44100,
        channelCount: 2,
    })
    await evalEngine.run(engine, code, { [SAMPLE_ARRAY_NAME]: sampleArrays[0] })
    return engine
}

main().then((engine) => {
    console.log('app started')
    ;(window as any).webPdEngine = engine
})