import { renderCode } from "../code-helpers"
import { Compilation } from "../compilation"
import { Code } from "../types"

export const compilePorts = (compilation: Compilation, {FloatType}: {FloatType: string}) => {
    const {portSpecs} = compilation.settings
    return renderCode`
        ${Object.entries(portSpecs).map(([variableName, spec]) => {
            const portsCode: Array<Code> = []
            if (spec.access.includes('r')) {
                // TODO : uniformize names of types 'float', 'messages', etc ...
                if (spec.type === 'float') {
                    portsCode.push(`
                        export function read_${variableName}(): ${FloatType} { 
                            return ${variableName} 
                        }
                    `)
                } else {
                    portsCode.push(`
                        export function read_${variableName}_length(): i32 { 
                            return ${variableName}.length
                        }
                        export function read_${variableName}_elem(index: i32): Message { 
                            return ${variableName}[index]
                        }
                    `)
                }
            }
            if (spec.access.includes('w')) {
                if (spec.type === 'float') {
                    portsCode.push(`
                        export function write_${variableName}(value: ${FloatType}): void { 
                            ${variableName} = value
                        }
                    `)
                } else {
                    portsCode.push(`
                        export function write_${variableName}(messages: Message[]): void { 
                            ${variableName} = messages
                        }
                    `)
                }
            }
            return portsCode
        })}
    `
}