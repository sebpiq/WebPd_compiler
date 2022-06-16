import { VARIABLE_NAMES } from '../constants'
import { NodeCodeGenerator } from '../types'

// ------------------------------ setup ------------------------------ //
export const setup: NodeCodeGenerator = (
    { args },
    { state, ins },
    { sampleRate }
) =>
    // TODO : more complex ways to set rate
    // Time units are all expressed in frames here
    `
        let ${state('rate')} = 0
        let ${state('nextTick')} = -1
        let ${state('realNextTick')} = -1

        const ${state('funcSetRate')} = (rate) => {
            ${state('rate')} = rate / 1000 * ${sampleRate}
        }

        const ${state('funcRefreshNextTick')} = () => {
            ${state('realNextTick')} = ${state('realNextTick')} + ${state(
        'rate'
    )}
            ${state('nextTick')} = Math.round(${state('realNextTick')})
        }

        const ${state('funcHandleMessage0')} = () => {
            let inMessage = ${ins('0')}.shift()
            if (inMessage.length === 0) {

            } else if (inMessage[0] === 0 || inMessage[0] === 'stop') {
                ${state('nextTick')} = 0
                ${state('realNextTick')} = 0
                
            } else if (${
                VARIABLE_NAMES.isNumber
            }(inMessage[0]) || inMessage[0] === 'bang') {
                ${state('nextTick')} = ${VARIABLE_NAMES.frame}
                ${state('realNextTick')} = ${VARIABLE_NAMES.frame}
        
            } else {
                // TODO : error handling
            }
        }

        const ${state('funcHandleMessage1')} = () => {
            let inMessage = ${ins('1')}.shift()
            if (inMessage.length === 1 && ${
                VARIABLE_NAMES.isNumber
            }(inMessage[0])) {
                ${state('funcSetRate')}(inMessage[0])
                
            } else {
                // TODO : error handling
            }
        }

        if (${VARIABLE_NAMES.isNumber}(${args.rate})) {
            ${state('funcSetRate')}(${args.rate})
        }
    `

// ------------------------------- loop ------------------------------ //
export const loop: NodeCodeGenerator = (_, { state, ins, outs }) => `
    while (${ins('1')}.length) {
        ${state('funcHandleMessage1')}()
    }
    while (${ins('0')}.length) {
        ${state('funcHandleMessage0')}()
    }
    if (frame === ${state('nextTick')}) {
        ${outs('0')}.push(['bang'])
        ${state('funcRefreshNextTick')}()
    }
`
