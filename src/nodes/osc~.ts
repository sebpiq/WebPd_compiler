import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = (
    node,
    { state, ins },
    { sampleRate }
) => {
    let frequencySetup = ''
    if (_hasSignalFrequencyInput(node)) {
        frequencySetup = `${ins('0_signal')} = ${node.args.frequency} || 0`
    } else {
        frequencySetup = `
            let ${state('currentFrequency')} = ${node.args.frequency} || 0
        `
    }
    return `
        let ${state('phase')} = 0
        let ${state('J')} = 2 * Math.PI / ${sampleRate}
        ${frequencySetup}
    `
}

// TODO: right inlet, reset phase
export const loop: NodeCodeGenerator = (node, { state, ins, outs }) => {
    // Take only the last received frequency message (first in the list)
    let phaseComputation = ''
    if (_hasSignalFrequencyInput(node)) {
        phaseComputation = `${state('phase')} += ${state('J')} * ${ins(
            '0_signal'
        )}`
    } else {
        phaseComputation = `
            if (${ins('0_control')}.length) {
                ${state('currentFrequency')} = ${ins('0_control')}.pop()
            }
            ${state('phase')} += ${state('J')} * ${state('currentFrequency')}
        `
    }

    return `
        ${phaseComputation}
        ${outs('0')} = Math.cos(${state('phase')})
    `
}

const _hasSignalFrequencyInput = (node: PdDspGraph.Node) =>
    node.sources['0_signal'] && node.sources['0_signal'].length
