import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = () => ``

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (node, { ins, outs }) => {
    return `
        ${outs('0')} = ${Object.keys(node.inlets)
        .map((inletId) => ins(inletId))
        .join(' + ')}
    `
}
