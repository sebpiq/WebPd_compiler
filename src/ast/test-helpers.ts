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
