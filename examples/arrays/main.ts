// import * as evalEngine from '@webpd/engine-core/src/eval-engine/index'
// import {createButton} from '@webpd/shared/example-helpers'
// import generate from '../../src/generate'
// import pEvent from 'p-event'
// import { sendMessage } from '../../src/api'

// const context = new AudioContext()

// const arraySize = 2056 * 64

// const noiseArray = new Float32Array(arraySize)
// for (let i = 0; i < arraySize; i++) {
//     const gain = (arraySize - i) / arraySize
//     noiseArray[i] = gain * (Math.random() * 2 - 1)
// }

// const sawtoothArray = new Float32Array(arraySize)
// for (let i = 0; i < arraySize; i++) {
//     const accelFactor = 0.5 + (0.5 * i / arraySize)
//     const gain = (arraySize - i) / arraySize
//     sawtoothArray[i] = gain * (-1 + 2 * (i % (512 * accelFactor)) / (512 * accelFactor))
// }

// const arrays = {
//     noise: noiseArray,
//     sawtooth: sawtoothArray,
// }

// const registry: PdRegistry.Registry = {
//     'tabplay~': {
//         buildInlets: () => ({
//             '0': {type: 'control'}
//         }),
//         buildOutlets: () => ({
//             '0': {type: 'signal'}
//         }),
//         isSink: () => false,
//         inflateArgs: (pdJsonArgs: PdJson.ObjectArgs) => ({
//             arrayName: pdJsonArgs[0]
//         })
//     },
//     'dac~': {
//         buildInlets: () => ({'0': {type: 'signal'}, '1': {type: 'signal'}}),
//         buildOutlets: () => ({}),
//         isSink: () => true,
//         inflateArgs: (pdJsonArgs: PdJson.ObjectArgs) => ({
//             frequency: pdJsonArgs[0]
//         })
//     },
// }

// const graph: PdDspGraph.Graph = {
//     'player': {
//         id: 'player',
//         type: 'tabplay~',
//         args: {
//             arrayName: 'noise'
//         },
//         sinks: {
//             '0': [
//                 {id: 'dac', portletId: '0'},
//                 {id: 'dac', portletId: '1'}
//             ]
//         },
//         sources: {}
//     },
//     'dac': {
//         id: 'dac',
//         type: 'dac~',
//         args: {},
//         sinks: {},
//         sources: {
//             '0': {id: 'player', portletId: '0'},
//             '1': {id: 'player', portletId: '0'},
//         }
//     }
// }

// const main = async () => {
//     let engine = await evalEngine.create(context, {
//         sampleRate: context.sampleRate, 
//         channelCount: 2,
//     })
//     const startButton = createButton('Start')
//     await pEvent(startButton, 'click')
//     engine = await evalEngine.init(engine)

//     const dspFunction = await generate(graph, registry, {
//         sampleRate: 44100,
//         channelCount: 2,
//     })
//     await evalEngine.run(engine, dspFunction, arrays)

//     const playButton = createButton('Play All')
//     playButton.onclick = () =>
//         sendMessage(engine, 'player', '0', ['bang'])

//     const playHalfButton = createButton('Play Half to End')
//     playHalfButton.onclick = () =>
//         sendMessage(engine, 'player', '0', [Math.round(0.5 * arraySize)])

//     const playMiddleButton = createButton('Play Middle')
//     playMiddleButton.onclick = () =>
//         sendMessage(engine, 'player', '0', [Math.round(0.25 * arraySize), Math.round(0.5 * arraySize)])

//     const setNoiseButton = createButton('Noise Array')
//     setNoiseButton.onclick = () =>
//         sendMessage(engine, 'player', '0', ['set', 'noise'])

//     const setSawToothButton = createButton('Sawtooth Array')
//     setSawToothButton.onclick = () =>
//         sendMessage(engine, 'player', '0', ['set', 'sawtooth'])

//     return engine
// }

// main().then((engine) => {
//     console.log('app started')
//     ;(window as any).webPdEngine = engine
// })