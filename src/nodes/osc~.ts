import { NodeDeclareState, NodeLoop, NodeSetup } from "../types"

const StateDeclaration = {
    phase: '',
    J: '',
}

export const declareState: NodeDeclareState = () => StateDeclaration

export const setup: NodeSetup<typeof StateDeclaration> = (_, {state}, {sampleRate}) => `
    let ${state.phase} = 0
    let ${state.J} = 2 * Math.PI / ${sampleRate}
`

export const loop: NodeLoop<typeof StateDeclaration> = (_, {state, ins, outs}) => `
    ${state.phase} += ${state.phase} * ${ins[0]}
    ${outs[0]} = Math.cos(${state.phase})
`