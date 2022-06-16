import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
// TODO : args
export const setup: NodeCodeGenerator = () => ``

// ------------------------------- loop ------------------------------ //
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
