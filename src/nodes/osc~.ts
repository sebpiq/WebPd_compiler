import { NodeLoop, NodeSetup } from '../types'

export const setup: NodeSetup = (
    node,
    { state, ins, outs },
    { sampleRate }
) => `
    let ${state('phase')} = 0
    let ${state('J')} = 2 * Math.PI / ${sampleRate}
    let ${ins('0')} = ${node.args.frequency}
    let ${outs('0')} = 0
`

export const loop: NodeLoop = (_, { state, ins, outs }) => `
    ${state('phase')} += ${state('J')} * ${ins('0')}
    ${outs('0')} = Math.cos(${state('phase')})
`
