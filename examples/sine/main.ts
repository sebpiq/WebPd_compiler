import * as evalEngine from '@webpd/engine-core/src/eval-engine'
import {createButton} from '@webpd/shared/example-helpers'
import generate from '../../src/generate'
import pEvent from 'p-event'

const context = new AudioContext()

const registry: PdRegistry.Registry = {
    'osc~': {
        getInletsTemplate: () => ({
            '0': {type: 'signal'}
        }),
        getOutletsTemplate: () => ({
            '0': {type: 'signal'}
        }),
        isSink: () => false,
        inflateArgs: (pdJsonArgs: PdJson.ObjectArgs) => ({
            frequency: pdJsonArgs[0]
        })
    },
    'dac~': {
        getInletsTemplate: () => ({'0': {type: 'signal'}, '1': {type: 'signal'}}),
        getOutletsTemplate: () => ({}),
        isSink: () => true,
        inflateArgs: (pdJsonArgs: PdJson.ObjectArgs) => ({
            frequency: pdJsonArgs[0]
        })
    },
}

const graph: PdDspGraph.Graph = {
    'oscLeft': {
        id: 'oscLeft',
        type: 'osc~',
        args: {
            frequency: 440
        },
        sinks: {
            '0': [{id: 'dac', portlet: '0'}]
        },
        sources: {}
    },
    'oscRight': {
        id: 'oscRight',
        type: 'osc~',
        args: {
            frequency: 330
        },
        sinks: {
            '0': [{id: 'dac', portlet: '1'}]
        },
        sources: {}
    },
    'dac': {
        id: 'dac',
        type: 'dac~',
        args: {},
        sinks: {},
        sources: {
            '0': {id: 'oscLeft', portlet: '0'},
            '1': {id: 'oscRight', portlet: '1'},
        }
    }
}

const main = async () => {
    let engine = await evalEngine.create(context, {
        sampleRate: context.sampleRate, 
        channelCount: 2,
    })
    const button = createButton('Start')
    await pEvent(button, 'click')
    engine = await evalEngine.init(engine)

    const dspFunction = await generate(graph, registry, {
        sampleRate: 44100,
        channelCount: 2,
    })
    await evalEngine.run(engine, dspFunction, {})
    return engine
}

main().then((engine) => {
    console.log('app started')
    ;(window as any).webPdEngine = engine
})