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
    const { accessorSpecs, engineVariableNames, inletListenerSpecs } =
        compilation
    const graphTraversal = traversal.breadthFirst(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}

        const ${globs.arrays} = new Map()

        ${compileDeclare(compilation, graphTraversal)}
        ${compileInletListeners(compilation)}

        const exports = {
            configure: (sampleRate, blockSize) => {
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize
                ${compileInitialize(compilation, graphTraversal)}
            },
            loop: (${globs.input}, ${globs.output}) => {
                ${compileLoop(compilation, graphTraversal)}
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
            inletListeners: {
                ${Object.entries(inletListenerSpecs).map(([nodeId, inletIds]) =>
                    `${nodeId}: {
                        ${inletIds.map(inletId => `
                            ${inletId}: {onMessages: () => undefined,}
                        `)}
                    }`
                )}
            },
            fs: {
                onReadSoundFile: () => undefined,
                onWriteSoundFile: () => undefined,
                onOpenSoundReadStream: () => undefined,
                onOpenSoundWriteStream: () => undefined,
                onSoundStreamData: () => undefined,
                onCloseSoundStream: () => undefined,
                sendReadSoundFileResponse: x_fs_onReadSoundFileResponse,
                sendWriteSoundFileResponse: x_fs_onWriteSoundFileResponse,
                sendSoundStreamData: x_fs_onSoundStreamData,
                closeSoundStream: x_fs_onCloseSoundStream,
            }
        }

        // FS IMPORTS
        const i_fs_readSoundFile = (...args) => exports.fs.onReadSoundFile(...args)
        const i_fs_writeSoundFile = (...args) => exports.fs.onWriteSoundFile(...args)
        const i_fs_openSoundReadStream = (...args) => exports.fs.onOpenSoundReadStream(...args)
        const i_fs_openSoundWriteStream = (...args) => exports.fs.onOpenSoundWriteStream(...args)
        const i_fs_sendSoundStreamData = (...args) => exports.fs.onSoundStreamData(...args)
        const i_fs_closeSoundStream = (...args) => exports.fs.onCloseSoundStream(...args)
    `
}

export const compileInletListeners = ({
    inletListenerSpecs,
    engineVariableNames,
}: Compilation) => {
    return renderCode`${Object.entries(inletListenerSpecs).map(
        ([nodeId, inletIds]) =>
            inletIds.map((inletId) => {
                const listenerVariableName =
                    engineVariableNames.inletListeners[nodeId][inletId]
                const inletVariableName =
                    engineVariableNames.n[nodeId].ins[inletId]
                return `
                const ${listenerVariableName} = () => {
                    exports.inletListeners['${nodeId}']['${inletId}'].onMessages(${inletVariableName})
                }
            `
            })
    )}`
}
