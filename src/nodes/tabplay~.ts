import { NodeCodeGenerator } from '../types'

export const setup: NodeCodeGenerator = (
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
        let inMessage = ${ins('0')}.shift()
        if (inMessage.length === 0) {
        } else if (inMessage[0] === 'set') {
            ${state('funcSetArrayName')}(inMessage[1])
            
        } else if (inMessage[0] === 'bang') {
            ${state('funcPlay')}(0)
    
        } else if (inMessage.length === 1) {
            ${state('funcPlay')}(inMessage[0])
    
        } else if (inMessage.length === 2) {
            ${state('funcPlay')}(inMessage[0], inMessage[1])
        }
    }

    ${state('funcSetArrayName')}("${node.args.arrayName}")
`

export const loop: NodeCodeGenerator = (_, { state, ins, outs }) => `
    ${ins('0')}.forEach(v => ${state('funcHandleMessage')}(v))

    if (${state('readPosition')} < ${state('readUntil')}) {
        ${outs('0')} = ${state('array')}[${state('readPosition')}]
        ${state('readPosition')}++
    }
`
