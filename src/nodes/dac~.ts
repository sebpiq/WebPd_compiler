import { NodeLoop, NodeSetup } from '../types'

export const setup: NodeSetup = (_, { ins }, { channelCount }) => {
    let setupStr = ''
    for (let ch = 0; ch < channelCount; ch++) {
        setupStr += `\nlet ${ins(`${ch}`)} = 0`
    }
    return setupStr
}

export const loop: NodeLoop = (
    _,
    { ins },
    { engineOutputVariableNames, channelCount }
) => {
    let loopStr = ''
    for (let ch = 0; ch < channelCount; ch++) {
        loopStr += `\n${engineOutputVariableNames[ch]} = ${ins(`${ch}`)}`
    }
    return loopStr
}
