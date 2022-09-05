/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { traversal } from '@webpd/dsp-graph'
import { renderCode } from '../code-helpers'
import { Compilation } from '../compilation'
import compileDeclare from '../engine-common/compile-declare'
import compileInitialize from '../engine-common/compile-initialize'
import compileLoop from '../engine-common/compile-loop'
import { Code } from '../types'
import { JavaScriptEngineCode } from './types'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const { portSpecs } = compilation
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.variableNames.g

    // prettier-ignore
    return renderCode`
        const ${globs.arrays} = new Map()

        ${compileDeclare(compilation, graphTraversal)}

        return {
            configure: (sampleRate, blockSize) => {
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize
                ${compileInitialize(compilation, graphTraversal)}
            },
            loop: (${globs.output}) => {
                for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                    ${globs.frame}++
                    ${compileLoop(compilation, graphTraversal)}
                }
            },
            setArray: (arrayName, array) => { 
                ${globs.arrays}.set(arrayName, array)
            },
            ports: {
                ${Object.entries(portSpecs).map(([variableName, spec]) => {
                    const portsCode: Array<Code> = []
                    if (spec.access.includes('r')) {
                        portsCode.push(`read_${variableName}: () => ${variableName},`)
                    }
                    if (spec.access.includes('w')) {
                        portsCode.push(`write_${variableName}: (value) => ${variableName} = value,`)
                    }
                    return portsCode
                })}
            }
        }
    `
}
