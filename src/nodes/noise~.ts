import { NodeCodeGenerator } from '../types'

// TODO : left inlet ?
export const setup: NodeCodeGenerator = () => ``

export const loop: NodeCodeGenerator = (_, { outs }) => {
    return `
        ${outs('0')} = Math.random() * 2 - 1
    `
}
