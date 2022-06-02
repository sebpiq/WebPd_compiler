import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = (node, { state, ins }) => {
    let valueSetup = ''
    if (_hasSignalRightInput(node)) {
        valueSetup = `${ins('1_signal')} = ${node.args.value} || 0`
    } else {
        valueSetup = `let ${state('value')} = ${node.args.value} || 0`
    }
    return `
        ${valueSetup}
    `
}

export const loop: NodeCodeGenerator = (node, { state, ins, outs }) => {
    if (_hasSignalRightInput(node)) {
        return `${outs('0')} = ${ins('0')} * ${ins('1_signal')}`
    } else {
        return `
            if (${ins('1_control')}.length) {
                ${state('value')} = ${ins('1_control')}.pop()[0]
            }
            ${outs('0')} = ${ins('0')} * ${state('value')}
        `
    }
}

const _hasSignalRightInput = (node: PdDspGraph.Node) =>
    node.sources['1_signal'] && node.sources['1_signal'].length
