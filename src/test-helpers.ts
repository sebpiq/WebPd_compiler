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
import * as variableNames from './engine-variable-names'
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
    const inletListenerSpecs = compilation.inletListenerSpecs || {}
    const engineVariableNames = variableNames.generate(
        nodeImplementations,
        graph
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
    }

    variableNames.attachInletListeners(engineVariableNames, inletListenerSpecs)
    variableNames.attachAccessors(target, engineVariableNames, accessorSpecs)
    variableNames.attachTypes(
        target,
        engineVariableNames,
        audioSettings.bitDepth
    )

    return {
        ...compilation,
        target,
        graph,
        nodeImplementations,
        audioSettings,
        accessorSpecs,
        inletListenerSpecs,
        macros: getMacros(target),
        engineVariableNames,
    }
}
