import { AstContainer } from './types'

const LINE_NORMALIZE_INDENTS_RE = /\s*\n\s*/g
const LINE_TRIM_START_RE = /^[\s\n]*/
const LINE_TRIM_END_RE = /[\s\n]*$/

export const normalizeCodeForTests = (ast: AstContainer): AstContainer => ({
    astType: 'Container',
    content: ast.content.map((element) => {
        if (typeof element === 'string') {
            return element
                .replaceAll(LINE_NORMALIZE_INDENTS_RE, '\n')
                .replace(LINE_TRIM_START_RE, '')
                .replace(LINE_TRIM_END_RE, '')
            
        } else if (element.astType === 'Func') {
            return {
                ...element,
                body: normalizeCodeForTests(element.body)
            }
        } else {
            return element
        }
    }).filter(element => typeof element === 'string' ? element.length : true)
})
