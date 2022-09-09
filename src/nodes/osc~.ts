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

import { NodeCodeGenerator, NodeImplementation } from '../types'

// ------------------------------ declare ------------------------------ //
export const declare: NodeCodeGenerator = (...args) => {
    const [node] = args
    return _hasSignalInput(node)
        ? declareSignal(...args)
        : declareControl(...args)
}

const declareSignal: NodeCodeGenerator = (_, { state, macros }) => `
    let ${macros.typedVarFloat(state.phase)}
    let ${macros.typedVarFloat(state.J)}
`

const declareControl: NodeCodeGenerator = (_, { state, globs, macros }) => `
    let ${macros.typedVarFloat(state.phase)}
    let ${macros.typedVarFloat(state.currentFrequency)}
    let ${macros.typedVarFloat(state.K)}
    const ${state.refreshK} = ${macros.functionHeader()} => 
        ${state.K} = ${state.currentFrequency} * 2 * Math.PI / ${
    globs.sampleRate
}
`

// ------------------------------ initialize ------------------------------ //
export const initialize: NodeCodeGenerator = (...args) => {
    const [node] = args
    return _hasSignalInput(node)
        ? initializeSignal(...args)
        : initializeControl(...args)
}

const initializeSignal: NodeCodeGenerator = (node, { ins, state, globs }) => `
    ${state.phase} = 0
    ${state.J} = 2 * Math.PI / ${globs.sampleRate}
    ${ins.$0_signal} = ${node.args.frequency || 0}
`

const initializeControl: NodeCodeGenerator = (node, { state }) => `
    ${state.phase} = 0
    ${state.currentFrequency} = ${(node.args.frequency as number) || 0}
    ${state.K} = 0
    ${state.refreshK}()
`

// ------------------------------- loop ------------------------------ //
// TODO: right inlet, reset phase
export const loop: NodeCodeGenerator = (...args) => {
    const [node] = args
    return _hasSignalInput(node) ? loopSignal(...args) : loopControl(...args)
}

const loopSignal: NodeCodeGenerator = (_, { state, ins, outs }) => `
    ${outs.$0} = Math.cos(${state.phase})
    ${state.phase} += ${state.J} * ${ins.$0_signal}
`

// Take only the last received frequency message (first in the list)
const loopControl: NodeCodeGenerator = (_, { state, ins, outs, macros }) => `
    if (${ins.$0_control}.length) {
        const ${macros.typedVarMessage('m')} = ${ins.$0_control}.pop()
        ${state.currentFrequency} = ${macros.readMessageFloatDatum('m', 0)}
        ${state.refreshK}()
    }
    ${outs.$0} = Math.cos(${state.phase})
    ${state.phase} += ${state.K}
`

// ------------------------------------------------------------------- //
export const stateVariables: NodeImplementation['stateVariables'] = [
    'phase',
    'currentFrequency',
    'J',
    'refreshK',
    'K',
]

const _hasSignalInput = (node: PdDspGraph.Node) =>
    node.sources['0_signal'] && node.sources['0_signal'].length
