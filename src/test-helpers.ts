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

import { Compilation, CompilerTarget } from './types'
import { attachAccessorsVariableNames as jsAttachAccessorsVariableNames } from './engine-javascript/compile-to-javascript'
import { attachAccessorsVariableNames as ascAttachAccessorsVariableNames } from './engine-assemblyscript/compile-to-assemblyscript'
import {
    generateEngineVariableNames,
    attachInletListenersVariableNames,
} from './engine-variable-names'
import { getMacros } from './compile'

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 3) =>
    Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)

export const makeCompilation = (
    compilation: Partial<Compilation>
): Compilation => {
    if (!compilation.target) {
        throw new Error(`Compilation target must be provided`)
    }
    const target: CompilerTarget = compilation.target
    const nodeImplementations = compilation.nodeImplementations || {}
    const graph = compilation.graph || {}
    const accessorSpecs = compilation.accessorSpecs || {}
    const inletListeners = compilation.inletListenerSpecs || {}
    const engineVariableNames = generateEngineVariableNames(
        nodeImplementations,
        graph
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: 2,
    }
    if (target === 'javascript') {
        jsAttachAccessorsVariableNames(engineVariableNames, accessorSpecs)
    } else if (target === 'assemblyscript') {
        ascAttachAccessorsVariableNames(engineVariableNames, accessorSpecs)
    }
    attachInletListenersVariableNames(engineVariableNames, inletListeners)
    return {
        ...compilation,
        target,
        graph,
        nodeImplementations,
        audioSettings,
        accessorSpecs,
        inletListenerSpecs: inletListeners,
        macros: getMacros(target),
        engineVariableNames,
    }
}
