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

import macros from './engine-javascript/macros'
import { Compilation, CompilerTarget } from './types'
import { attachPortsVariableNames as jsAttachPortsVariableNames } from './engine-javascript/compile-to-javascript'
import { attachPortsVariableNames as ascAttachPortsVariableNames } from './engine-assemblyscript/compile-to-assemblyscript'
import {
    generateEngineVariableNames,
    attachInletListenersVariableNames,
} from './engine-variable-names'

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
    const portSpecs = compilation.portSpecs || {}
    const inletListeners = compilation.inletListeners || {}
    const engineVariableNames = generateEngineVariableNames(
        nodeImplementations,
        graph
    )
    if (target === 'javascript') {
        jsAttachPortsVariableNames(engineVariableNames, portSpecs)
    } else if (target === 'assemblyscript') {
        ascAttachPortsVariableNames(engineVariableNames, portSpecs)
    }
    attachInletListenersVariableNames(engineVariableNames, inletListeners)
    return {
        target,
        graph,
        nodeImplementations,
        audioSettings: {
            bitDepth: 32,
            channelCount: 2,
        },
        portSpecs,
        inletListeners,
        macros: macros,
        engineVariableNames: engineVariableNames,
        ...compilation,
    }
}
