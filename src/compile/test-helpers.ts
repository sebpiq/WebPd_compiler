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
import assert from 'assert'
import { validateSettings } from './settings'
import { initializePrecompilation } from './precompile'
import { PrecompilationInput, Precompilation } from './precompile/types'
import { RenderInput, RenderTemplateInput } from './render/types'
import { AstSequence, AstElement, Code } from '../ast/types'
import { CompilationSettings, GlobalCodePrecompilationContext } from './types'

type PartialSettings = Partial<CompilationSettings>

type PartialPrecompilationInput = Partial<
    Omit<PrecompilationInput, 'settings'> & { settings: PartialSettings }
>

export const makeSettings = (settings: PartialSettings): CompilationSettings =>
    validateSettings(settings, settings.target || 'javascript')

export const makePrecompilation = (
    precompilationInput: PartialPrecompilationInput
): Precompilation => {
    const settings = makeSettings(precompilationInput.settings || {})
    const nodeImplementations = precompilationInput.nodeImplementations || {
        DUMMY: {},
    }
    const graph = precompilationInput.graph || {}
    const input: PrecompilationInput = {
        settings,
        graph,
        nodeImplementations,
    }

    return initializePrecompilation(input)
}

export const makeGlobalCodePrecompilationContext = (
    precompilation: Precompilation
): GlobalCodePrecompilationContext => ({
    globs: precompilation.variableNamesAssigner.globs,
    globalCode: precompilation.variableNamesAssigner.globalCode,
    settings: precompilation.settings,
})

export const precompilationToRenderInput = (
    precompilation: Precompilation
): RenderInput => {
    return {
        precompiledCode: precompilation.precompiledCode,
        settings: precompilation.settings,
        variableNamesIndex: precompilation.variableNamesIndex,
    }
}

export const precompilationToRenderTemplateInput = (
    precompilation: Precompilation
): RenderTemplateInput => {
    return {
        globs: precompilation.variableNamesIndex.globs,
        globalCode: precompilation.variableNamesIndex.globalCode,
        precompiledCode: precompilation.precompiledCode,
        settings: precompilation.settings,
    }
}

const LINE_NORMALIZE_INDENTS_RE = /\s*\n\s*/g
const LINE_TRIM_START_RE = /^[\s\n]*/
const LINE_TRIM_END_RE = /[\s\n]*$/

export const assertAstSequencesAreEqual = (
    actual: AstSequence,
    expected: AstSequence
) => {
    assert.deepStrictEqual(
        normalizeAstSequence(actual),
        normalizeAstSequence(expected)
    )
}

export const normalizeAstSequence = <T extends AstElement>(element: T): T => {
    switch (element.astType) {
        case 'Func':
            return {
                ...element,
                body: normalizeAstSequence(element.body),
                args: element.args.map(normalizeAstSequence),
            }
        case 'Class':
            return {
                ...element,
                members: element.members.map(normalizeAstSequence),
            }
        case 'Sequence':
            return {
                ...element,
                content: element.content
                    .map((element) => {
                        if (typeof element === 'string') {
                            return _normalizeCode(element)
                        } else {
                            return normalizeAstSequence(element)
                        }
                    })
                    .filter((element) => {
                        return typeof element === 'string'
                            ? element.length > 0
                            : true
                    }),
            }
        case 'Var':
        case 'ConstVar':
            return {
                ...element,
                value: element.value
                    ? normalizeAstSequence(element.value)
                    : element.value,
            }

        default:
            return { ...element }
    }
}

const _normalizeCode = (code: Code) =>
    code
        .replaceAll(LINE_NORMALIZE_INDENTS_RE, '\n')
        .replace(LINE_TRIM_START_RE, '')
        .replace(LINE_TRIM_END_RE, '')
