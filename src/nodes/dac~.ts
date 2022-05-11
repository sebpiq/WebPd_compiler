import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = () => ``

export const loop: NodeCodeGenerator = (
    _,
    { ins },
    { variableNames, channelCount }
) => {
    let loopStr = ''
    for (let ch = 0; ch < channelCount; ch++) {
        loopStr += `\n${variableNames.output[ch]} = ${ins(`${ch}`)}`
    }
    return loopStr
}
