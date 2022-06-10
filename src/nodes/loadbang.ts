import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = (_, { state }) => `
    let ${state('init')} = true
`

export const loop: NodeCodeGenerator = (_, { outs, state }) => {
    return `
        if (${state('init')}) {
            ${state('init')} = false
            ${outs('0')}.push(['bang'])
        }
    `
}
