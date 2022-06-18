/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (...args) => {
    const [node] = args
    return _hasSignalInput(node) ? setupSignal(...args) : setupControl(...args)
}

const setupSignal: NodeCodeGenerator = (
    node,
    { ins, state },
    { sampleRate }
) => `
    let ${state('phase')} = 0
    let ${state('J')} = 2 * Math.PI / ${sampleRate}
    ${ins('0_signal')} = ${node.args.frequency} || 0
`

const setupControl: NodeCodeGenerator = (node, { state }, { sampleRate }) => `
    let ${state('phase')} = 0
    let ${state('currentFrequency')} = (${node.args.frequency} || 0)
    let ${state('K')} = 0
    const ${state('refreshK')} = () => 
        ${state('K')} = ${state(
    'currentFrequency'
)} * 2 * Math.PI / ${sampleRate}
    ${state('refreshK')}()
`

// ------------------------------- loop ------------------------------ //
// TODO: right inlet, reset phase
export const loop: NodeCodeGenerator = (...args) => {
    const [node] = args
    return _hasSignalInput(node) ? loopSignal(...args) : loopControl(...args)
}

const loopSignal: NodeCodeGenerator = (_, { state, ins, outs }) => `
    ${outs('0')} = Math.cos(${state('phase')})
    ${state('phase')} += ${state('J')} * ${ins('0_signal')}
`

// Take only the last received frequency message (first in the list)
const loopControl: NodeCodeGenerator = (_, { state, ins, outs }) => `
    if (${ins('0_control')}.length) {
        ${state('currentFrequency')} = ${ins('0_control')}.pop()
        ${state('refreshK')}()
    }
    ${outs('0')} = Math.cos(${state('phase')})
    ${state('phase')} += ${state('K')}
`

// ------------------------------------------------------------------- //
const _hasSignalInput = (node: PdDspGraph.Node) =>
    node.sources['0_signal'] && node.sources['0_signal'].length
