import { AstContainer, Code, CodeMacros } from './types'

/**
 * Renders templated strings which contain nested arrays of strings.
 * This helper allows to use functions such as `.map` to generate several lines
 * of code, without having to use `.join('\n')`.
 * If a code line inserted in the template is falsy (null / undefined), it is ignored.
 * @todo : should not have to check for falsy codeLine has it should be typechecked.
 */
const render = (macros: CodeMacros, node: AstContainer): Code => {
    return node.content
        .map((element) => {
            if (!element) {debugger}
            if (typeof element === 'string') {
                return element
            } else if (element.astType === 'Var') {
                return macros.Var(
                    element,
                    element.value ? render(macros, element.value) : undefined
                )
            } else if (element.astType === 'ConstVar') {
                return macros.ConstVar(
                    element,
                    element.value ? render(macros, element.value) : undefined
                )
            } else if (element.astType === 'Func') {
                return macros.Func(element, render(macros, element.body))
            } else if (element.astType === 'Class') {
                return macros.Class(element)
            } else {
                throw new Error(`Unexpected element in AST ${element}`)
            }
        })
        .join('')
}

export default render
