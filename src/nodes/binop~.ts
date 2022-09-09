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

// ------------------------------ declare ------------------------------ //
export const makeDeclare = (): NodeCodeGenerator => (...args) => {
    const [node] = args
    return _hasSignalInput(node)
        ? declareSignal(...args)
        : declareControl(...args)
}

const declareSignal: NodeCodeGenerator = () => ``

const declareControl: NodeCodeGenerator = (_, { state, macros }) =>
    `let ${macros.typedVarFloat(state.rightOp)}`

// ------------------------------ initialize ------------------------------ //
export const makeInitialize = (defaultValue: number): NodeCodeGenerator => (
    ...args
) => {
    const [node] = args
    const initializeSignal = makeInitializeSignal(defaultValue)
    const initializeControl = makeInitializeControl(defaultValue)
    return _hasSignalInput(node)
        ? initializeSignal(...args)
        : initializeControl(...args)
}

const makeInitializeSignal = (defaultValue: number): NodeCodeGenerator => (
    node,
    { ins }
) => `${ins.$1_signal} = ${node.args.value || defaultValue}`

const makeInitializeControl = (defaultValue: number): NodeCodeGenerator => (
    node,
    { state }
) => `${state.rightOp} = ${(node.args.value as string) || defaultValue}`

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
    { ins, outs, state, macros }
) => `
        if (${ins.$1_control}.length) {
            const ${macros.typedVarMessage('inMessage')} = ${
    ins.$1_control
}.pop()
            ${state.rightOp} = ${macros.readMessageFloatDatum('inMessage', 0)}
        }
        ${outs.$0} = ${ins.$0} ${operator} ${state.rightOp}`

// ------------------------------------------------------------------- //
export const stateVariables: NodeImplementation['stateVariables'] = ['rightOp']

const _hasSignalInput = (node: PdDspGraph.Node) =>
    node.sources['1_signal'] && node.sources['1_signal'].length

const binopTilde: NodeImplementations = {
    '+~': {
        initialize: makeInitialize(0),
        declare: makeDeclare(),
        loop: makeLoop('+'),
        stateVariables,
    },
    '*~': {
        initialize: makeInitialize(1),
        declare: makeDeclare(),
        loop: makeLoop('*'),
        stateVariables,
    },
}

export default binopTilde
