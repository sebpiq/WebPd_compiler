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
import { renderCode } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileInitialize from '../engine-common/compile-initialize'
import compileLoop from '../engine-common/compile-loop'
import { Compilation } from '../types'
import { JavaScriptEngineCode } from './types'
import generateCoreCode from './core-code'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const { accessorSpecs, engineVariableNames } = compilation
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}

        const ${globs.arrays} = new Map()

        ${compileDeclare(compilation, graphTraversal)}

        const exports = {
            configure: (sampleRate, blockSize) => {
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize
                ${compileInitialize(compilation, graphTraversal)}
            },
            loop: (${globs.input}, ${globs.output}) => {
                for (${globs.iterFrame} = 0; ${globs.iterFrame} < ${globs.blockSize}; ${globs.iterFrame}++) {
                    ${globs.frame}++
                    ${compileLoop(compilation, graphTraversal)}
                }
            },
            setArray: (arrayName, array) => { 
                ${globs.arrays}.set(arrayName, array)
            },
            accessors: {
                ${Object.entries(accessorSpecs).map(([variableName, spec]) => {
                    const accessorsVariableNames = compilation.engineVariableNames.accessors[variableName]
                    return `
                        ${spec.access.includes('r') ? 
                            `${accessorsVariableNames.r}: () => ${variableName},`: ''}
                        ${spec.access.includes('w') ? 
                            `${accessorsVariableNames.w}: (value) => ${variableName} = value,`: ''}
                    `
                })}
            },
            fs: {
                onRequestReadSoundFile: () => undefined,
                // onRequestReadSoundStream: () => undefined,
                // onRequestWriteSoundFile: () => undefined,
                // onRequestCloseSoundStream: () => undefined,
                readSoundFileResponse: x_fs_readSoundFileResponse,
                // writeSoundFileResponse: x_fs_writeSoundFileResponse,
                // soundStreamData: x_fs_soundStreamData,
                // soundStreamClose: x_fs_soundStreamClose,
            }
        }
    `
}
