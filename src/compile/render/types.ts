import { AstVar, Code, AstConstVar, AstFunc, AstClass } from '../../ast/types'
import { PrecompiledCode } from '../precompile/types'
import { CompilationSettings } from '../types'

/**
 * Macros injected in code generators so that they can be written in a generic manner.
 * Each target language supported must implement the full set of macros.
 */
export interface CodeMacros {
    Var: (declaration: AstVar, renderedValue: Code) => Code
    ConstVar: (declaration: AstConstVar, renderedValue: Code) => Code
    Func: (
        declaration: AstFunc,
        renderedArgsValues: Array<Code | null>,
        renderedBody: Code
    ) => Code
    Class: (declaration: AstClass) => Code
}

export interface RenderInput {
    readonly settings: CompilationSettings
    readonly precompiledCode: PrecompiledCode
}
