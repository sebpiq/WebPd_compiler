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

import { graphTraversalForCompile } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import { compileEventConfigure } from '../engine-common/compile-events'
import compileLoop from '../engine-common/compile-loop'
import { Compilation, EngineMetadata } from '../types'
import { JavaScriptEngineCode } from './types'
import generateCoreCodeJs from './core-code'
import { renderCode } from '../functional-helpers'

export default (compilation: Compilation): JavaScriptEngineCode => {
    const {
        codeVariableNames,
        outletListenerSpecs,
        inletCallerSpecs,
        audioSettings,
    } = compilation
    const graphTraversal = graphTraversalForCompile(compilation.graph)
    const globs = compilation.codeVariableNames.globs
    const { FloatArray } = codeVariableNames.types
    const metadata: EngineMetadata = {
        audioSettings: {
            ...audioSettings,
            // Determined at configure
            sampleRate: 0,
            blockSize: 0,
        },
        compilation: {
            inletCallerSpecs,
            outletListenerSpecs,
            codeVariableNames,
        },
    }

    // prettier-ignore
    return renderCode`
        ${generateCoreCodeJs(codeVariableNames)}

        ${compileDeclare(compilation, graphTraversal)}
        ${compileOutletListeners(compilation)}

        const exports = {
            metadata: ${JSON.stringify(metadata)},
            configure: (sampleRate, blockSize) => {
                ${globs.sampleRate} = sampleRate
                ${globs.blockSize} = blockSize
                exports.metadata.audioSettings.sampleRate = sampleRate
                exports.metadata.audioSettings.blockSize = blockSize
                ${compileEventConfigure(compilation, graphTraversal)}
            },
            loop: (${globs.input}, ${globs.output}) => {
                ${compileLoop(compilation, graphTraversal)}
            },
            farray: {
                get: farray_get,
                set: (arrayName, array) => farray_set(arrayName, new ${FloatArray}(array)),
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
                            "${inletId}": ${codeVariableNames.inletCallers[nodeId][inletId]}
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
            },
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
    codeVariableNames,
}: Compilation) => {
    return renderCode`${Object.entries(outletListenerSpecs).map(
        ([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const listenerVariableName =
                    codeVariableNames.outletListeners[nodeId][outletId]
                return `
                    const ${listenerVariableName} = (m) => {
                        exports.outletListeners['${nodeId}']['${outletId}'].onMessage(m)
                    }
                `
            })
    )}`
}
