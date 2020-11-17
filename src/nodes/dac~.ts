import { NodeDeclareState, NodeLoop, NodeSetup } from "../types"

const StateDeclaration = {}

export const declareState: NodeDeclareState = () => StateDeclaration

export const setup: NodeSetup<typeof StateDeclaration> = (_) => ``

export const loop: NodeLoop<typeof StateDeclaration> = (_, {ins}, {engineOutputVariableNames, channelCount}) => {
    let loopStr = ''
    for (let ch = 0; ch < channelCount; ch++) {
        loopStr += `\n${engineOutputVariableNames[ch]} = ${ins[ch]}`
    }
    return loopStr
}