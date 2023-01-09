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

import { renderCode } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileInitialize from '../engine-common/compile-initialize'
import compileLoop from '../engine-common/compile-loop'
import { Compilation } from '../types'
import { JavaScriptEngineCode } from './types'
import generateCoreCode from './core-code'
import { graphTraversalForCompile } from '../engine-common/core'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const { engineVariableNames, outletListenerSpecs, inletCallerSpecs } =
        compilation
    const graphTraversal = graphTraversalForCompile(compilation.graph)
    const globs = compilation.engineVariableNames.g
    const coreCode = generateCoreCode(engineVariableNames)

    // prettier-ignore
    return renderCode`
        ${coreCode}
        ${compileDeclare(compilation, graphTraversal)}
        ${compileOutletListeners(compilation)}

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
            outletListeners: {
                ${Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
                    `${nodeId}: {
                        ${outletIds.map(outletId => `
                            "${outletId}": {onMessage: () => undefined,}
                        `)}
                    }`
                )}
            },
            inletCallers: {
                ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
                    `${nodeId}: {
                        ${inletIds.map(inletId => `
                            "${inletId}": ${engineVariableNames.inletCallers[nodeId][inletId]}
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

export const compileOutletListeners = ({
    outletListenerSpecs,
    engineVariableNames,
}: Compilation) => {
    return renderCode`${Object.entries(outletListenerSpecs).map(
        ([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const listenerVariableName =
                    engineVariableNames.outletListeners[nodeId][outletId]
                return `
                    const ${listenerVariableName} = (m) => {
                        exports.outletListeners['${nodeId}']['${outletId}'].onMessage(m)
                    }
                `
            })
    )}`
}
