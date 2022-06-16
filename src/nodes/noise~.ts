import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
// TODO : left inlet ?
export const setup: NodeCodeGenerator = () => ``

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { outs }) => {
    return `
        ${outs('0')} = Math.random() * 2 - 1
    `
}
