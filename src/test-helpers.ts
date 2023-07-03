/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {
    AudioSettings,
    Code,
    Compilation,
    CompilerTarget,
    Module,
    RawModule,
} from './types'
import * as variableNames from './engine-common/code-variable-names'
import { getMacros } from './compile'
import { writeFile } from 'fs/promises'
import {
    buildGraphTraversalDeclare,
    buildGraphTraversalLoop,
} from './compile-helpers'
import { instantiateJsCode } from './engine-javascript/test-helpers'
import { compileAscCode, instantiateWasmBuffer } from './engine-assemblyscript/test-helpers'

export const normalizeCode = (rawCode: string) => {
    const lines = rawCode
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => !!line.length)
    return lines.join('\n')
}

export const round = (v: number, decimals: number = 4) => {
    // Useful to round big numbers in scientific notation, e.g. 3.282417323806467e+38
    if (v > 1000000) {
        return +v.toPrecision(decimals)
    }
    const rounded =
        Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)
    // Useful to normalise -0 / 0 which compare as different.
    if (rounded === 0) {
        return 0
    }
    return rounded
}

export const makeCompilation = (
    compilation: Partial<Compilation>
): Compilation => {
    const debug = compilation.debug || false
    const target: CompilerTarget = compilation.target || 'javascript'
    const nodeImplementations = compilation.nodeImplementations || {
        DUMMY: { loop: () => '' },
    }
    const graph = compilation.graph || {}
    const arrays = compilation.arrays || {}
    const inletCallerSpecs = compilation.inletCallerSpecs || {}
    const outletListenerSpecs = compilation.outletListenerSpecs || {}
    const graphTraversalDeclare =
        compilation.graphTraversalDeclare ||
        buildGraphTraversalDeclare(graph, inletCallerSpecs)
    const graphTraversalLoop =
        compilation.graphTraversalLoop || buildGraphTraversalLoop(graph)
    const precompiledPortlets = compilation.precompiledPortlets || {
        precompiledInlets: {},
        precompiledOutlets: {},
    }
    const codeVariableNames = variableNames.generate(
        nodeImplementations,
        graph,
        debug
    )
    const audioSettings = compilation.audioSettings || {
        bitDepth: 32,
        channelCount: { in: 2, out: 2 },
    }
    variableNames.attachOutletListeners(codeVariableNames, outletListenerSpecs)
    variableNames.attachInletCallers(codeVariableNames, inletCallerSpecs)
    return {
        ...compilation,
        target,
        graph,
        graphTraversalDeclare,
        graphTraversalLoop,
        nodeImplementations,
        audioSettings,
        arrays,
        outletListenerSpecs,
        inletCallerSpecs,
        macros: getMacros(target),
        codeVariableNames,
        debug,
        precompiledPortlets,
    }
}

interface CreateTestModuleApplyBindings {
    assemblyscript?: (buffer: ArrayBuffer) => Promise<Module>
    javascript?: (rawModule: RawModule) => Promise<Module>
}

/** Helper function to create a `Module` for running tests. */
export const createTestModule = async <ModuleType extends Module>(
    target: CompilerTarget,
    bitDepth: AudioSettings['bitDepth'],
    code: Code,
    applyBindings: CreateTestModuleApplyBindings = {},
): Promise<ModuleType> => {
    const applyBindingsNonNull: Required<CreateTestModuleApplyBindings> = {
        javascript: (rawModule) => rawModule,
        assemblyscript: (buffer) => instantiateWasmBuffer(buffer),
        ...applyBindings,
    }

    // Always save latest compilation for easy inspection
    await writeFile(
        `./tmp/latest-compilation.${target === 'javascript' ? 'js' : 'asc'}`,
        code
    )
    switch (target) {
        case 'javascript':
            const rawModule = await instantiateJsCode(code)
            return applyBindingsNonNull.javascript(rawModule)
        case 'assemblyscript':
            const buffer = await compileAscCode(code, bitDepth)
            return applyBindingsNonNull.assemblyscript(buffer)
    }
}