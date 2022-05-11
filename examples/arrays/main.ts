import * as evalEngine from '@webpd/engine-core/src/eval-engine'
import { createButton } from '@webpd/shared/example-helpers'
import compile from '../../src/compile'
import pEvent from 'p-event'
import DEFAULT_REGISTRY from '@webpd/dsp-graph/src/default-registry'
import NODE_IMPLEMENTATIONS from '../../src/nodes'
import { Engine } from '@webpd/engine-core/src/eval-engine/types'
import { setInlet } from '../../src/api'
import { ENGINE_ARRAYS_VARIABLE_NAME } from '@webpd/engine-core/src/eval-engine/constants'

const SAMPLE_URL = '/sample.mp3'
const CONTEXT = new AudioContext()
const TABPLAY_LEFT_ID = 'tabplayLeft'
const TABPLAY_RIGHT_ID = 'tabplayRight'
const SAMPLE_LEFT_ARRAY_NAME = 'SAMPLE_LEFT'
const SAMPLE_RIGHT_ARRAY_NAME = 'SAMPLE_RIGHT'

const tabplayLeftArgs = { arrayName: SAMPLE_LEFT_ARRAY_NAME }
const tabplayRightArgs = { arrayName: SAMPLE_RIGHT_ARRAY_NAME }

const graph: PdDspGraph.Graph = {
    [TABPLAY_LEFT_ID]: {
        id: TABPLAY_LEFT_ID,
        type: 'tabplay~',
        args: tabplayLeftArgs,
        sinks: {
            '0': [{ nodeId: 'dac', portletId: '0' }],
        },
        sources: {},
        inlets: DEFAULT_REGISTRY['tabplay~'].buildInlets(tabplayLeftArgs),
        outlets: DEFAULT_REGISTRY['tabplay~'].buildOutlets(tabplayLeftArgs),
    },
    [TABPLAY_RIGHT_ID]: {
        id: TABPLAY_RIGHT_ID,
        type: 'tabplay~',
        args: tabplayRightArgs,
        sinks: {
            '0': [{ nodeId: 'dac', portletId: '1' }],
        },
        sources: {},
        inlets: DEFAULT_REGISTRY['tabplay~'].buildInlets(tabplayRightArgs),
        outlets: DEFAULT_REGISTRY['tabplay~'].buildOutlets(tabplayRightArgs),
    },
    dac: {
        id: 'dac',
        type: 'dac~',
        args: {},
        sinks: {},
        sources: {
            '0': [{ nodeId: TABPLAY_LEFT_ID, portletId: '0' }],
            '1': [{ nodeId: TABPLAY_RIGHT_ID, portletId: '0' }],
        },
        isEndSink: true,
        inlets: DEFAULT_REGISTRY['dac~'].buildInlets({}),
        outlets: DEFAULT_REGISTRY['dac~'].buildOutlets({}),
    },
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
    evalEngine.callPort(engine, ...setInlet(TABPLAY_LEFT_ID, '0', ['bang']))
    evalEngine.callPort(engine, ...setInlet(TABPLAY_RIGHT_ID, '0', ['bang']))
}

const main = async () => {
    let engine = await evalEngine.create(CONTEXT, {
        sampleRate: CONTEXT.sampleRate,
        channelCount: 2,
    })
    const startButton = createButton('Start')
    const sampleArrays = await loadSample(CONTEXT)
    await pEvent(startButton, 'click')

    engine = await evalEngine.init(engine)
    const code = await compile(graph, NODE_IMPLEMENTATIONS, {
        sampleRate: 44100,
        channelCount: 2,
        arraysVariableName: ENGINE_ARRAYS_VARIABLE_NAME,
    })
    console.log(code)
    await evalEngine.run(engine, code, {
        [SAMPLE_LEFT_ARRAY_NAME]: sampleArrays[0],
        [SAMPLE_RIGHT_ARRAY_NAME]: sampleArrays[1],
    })
    const bangButton = createButton('Bang [tabplay~]')
    bangButton.onclick = () => bangTabPlay(engine)

    return engine
}

main().then((engine) => {
    console.log('app started')
    ;(window as any).webPdEngine = engine
})
