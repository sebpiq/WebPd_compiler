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

import { attachPortsAndMessageListenersVariableNames, generateEngineVariableNames } from "./compile"
import MACROS from "./engine-javascript/macros"
import { Compilation } from "./types"

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 3) =>
    Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)

export const makeCompilation = (compilation: Partial<Compilation>): Compilation => {
    const nodeImplementations = compilation.nodeImplementations || {}
    const graph = compilation.graph || {}
    const engineVariableNames = generateEngineVariableNames(nodeImplementations, graph)
    attachPortsAndMessageListenersVariableNames(
        engineVariableNames, 
        compilation.portSpecs || {}, 
        compilation.messageListenerSpecs || {},
    )
    return {
        graph, 
        nodeImplementations,
        audioSettings: {
            bitDepth: 32,
            channelCount: 2,
        },
        portSpecs: {},
        messageListenerSpecs: {},
        macros: MACROS,
        engineVariableNames: engineVariableNames,
        ...compilation,
    }
}