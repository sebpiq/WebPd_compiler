import assert from 'assert'
import { validateSettings } from '.'
import { buildFullGraphTraversal } from './compile-helpers'
import { initializePrecompiledCode } from './precompile'
import {
    PrecompilationInput,
    PrecompilationOperation,
} from './precompile/types'
import { RenderInput } from './render/types'
import { AstSequence, AstElement, Code } from '../ast/types'
import { CompilationSettings } from './types'

type PartialSettings = Partial<CompilationSettings>

type PartialPrecompilationInput = Partial<
    Omit<PrecompilationInput, 'settings'> & { settings: PartialSettings }
>

export const makeSettings = (settings: PartialSettings): CompilationSettings =>
    validateSettings(settings, settings.target || 'javascript')

export const makePrecompilation = (
    precompilationInput: PartialPrecompilationInput
): PrecompilationOperation => {
    const target = (precompilationInput.settings || {}).target || 'javascript'
    const settings = validateSettings(precompilationInput.settings || {}, target)
    const nodeImplementations = precompilationInput.nodeImplementations || {
        DUMMY: {},
    }
    const graph = precompilationInput.graph || {}
    const input: PrecompilationInput = {
        settings,
        graph,
        nodeImplementations,
    }
    const output = initializePrecompiledCode(
        input,
        buildFullGraphTraversal(graph, settings)
    )
    return {
        input,
        output,
    }
}

export const makeRenderInput = (
    ...args: Parameters<typeof makePrecompilation>
): RenderInput => {
    const precompilation = makePrecompilation(...args)
    return {
        precompiledCode: precompilation.output,
        settings: precompilation.input.settings,
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
