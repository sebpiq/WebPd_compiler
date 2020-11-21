import { NodeLoop, NodeSetup } from '../types'

export const setup: NodeSetup = (
    node,
    { state, ins, outs },
    {engineArraysVariableName}
) => `
    let ${state('array')} = new Float32Array(0)
    let ${state('readPosition')} = 0
    let ${state('readUntil')} = 0

    let ${ins('0')} = []
    let ${outs('0')} = 0

    const ${state('funcSetArrayName')} = (arrayName) => {
        ${state('array')} = ${engineArraysVariableName}[arrayName] || new Float32Array(0)
        ${state('readPosition')} = ${state('array')}.length
        ${state('readUntil')} = ${state('array')}.length
    }

    const ${state('funcPlay')} = (startPosition, sampleCount) => {
        ${state('readPosition')} = startPosition
        ${state('readUntil')} = sampleCount !== undefined ? Math.min(startPosition + sampleCount, ${state('array')}.length) : ${state('array')}.length
    }

    const ${state('funcHandleMessage')} = () => {
        if (${ins('0')}.length === 0) {
        } else if (${ins('0')}[0] === 'set') {
            ${state('funcSetArrayName')}(${ins('0')}[1])
            
        } else if (${ins('0')}[0] === 'bang') {
            ${state('funcPlay')}(0)
    
        } else if (${ins('0')}.length === 1) {
            ${state('funcPlay')}(${ins('0')}[0])
    
        } else if (${ins('0')}.length === 2) {
            ${state('funcPlay')}(${ins('0')}[0], ${ins('0')}[1])
        }
        ${ins('0')} = []
    }

    ${state('funcSetArrayName')}("${node.args.arrayName}")
`

export const loop: NodeLoop = (_, { state, ins, outs }) => `
    ${state('funcHandleMessage')}()

    if (${state('readPosition')} < ${state('readUntil')}) {
        ${outs('0')} = ${state('array')}[${state('readPosition')}]
        ${state('readPosition')}++
    }
`
