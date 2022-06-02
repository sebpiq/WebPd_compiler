import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = () => ``

export const loop: NodeCodeGenerator = (node, { ins, outs }) => {
    return `
        ${outs('0')} = ${Object.keys(node.inlets).map(inletId => ins(inletId)).join(' + ')}
    `
}