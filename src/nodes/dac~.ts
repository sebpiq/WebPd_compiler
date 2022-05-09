import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = () => ``

export const loop: NodeCodeGenerator = (
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