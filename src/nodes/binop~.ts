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

import {
    NodeCodeGenerator,
    NodeImplementation,
    NodeImplementations,
} from '../types'

// ------------------------------ setup ------------------------------ //
export const makeSetup = (): NodeCodeGenerator => (...args) => {
    const [node] = args
    return _hasSignalInput(node) ? setupSignal(...args) : setupControl(...args)
}

const setupSignal: NodeCodeGenerator = (node, { ins }) =>
    `${ins.$1_signal} = ${node.args.value} || 0`

const setupControl: NodeCodeGenerator = (node, { state, MACROS }) =>
    `${MACROS.declareSignal(state.rightOp, (node.args.value as string) || 0)}`

// ------------------------------- loop ------------------------------ //
export const makeLoop = (operator: string): NodeCodeGenerator => {
    const loopSignal = makeLoopSignal(operator)
    const loopControl = makeLoopControl(operator)
    return (...args) => {
        const [node] = args
        return _hasSignalInput(node)
            ? loopSignal(...args)
            : loopControl(...args)
    }
}

const makeLoopSignal = (operator: string): NodeCodeGenerator => (
    _,
    { ins, outs }
) => `${outs.$0} = ${ins.$0} ${operator} ${ins.$1_signal}`

const makeLoopControl = (operator: string): NodeCodeGenerator => (
    _,
    { ins, outs, state }
) => `
        if (${ins.$1_control}.length) {
            ${state.rightOp} = ${ins.$1_control}.pop()[0]
        }
        ${outs.$0} = ${ins.$0} ${operator} ${state.rightOp}`

// ------------------------------------------------------------------- //
export const stateVariables: NodeImplementation['stateVariables'] = ['rightOp']

const _hasSignalInput = (node: PdDspGraph.Node) =>
    node.sources['1_signal'] && node.sources['1_signal'].length

const binopTilde: NodeImplementations = {
    '+~': {
        setup: makeSetup(),
        loop: makeLoop('+'),
        stateVariables,
    },
    '*~': {
        setup: makeSetup(),
        loop: makeLoop('*'),
        stateVariables,
    },
}

export default binopTilde
