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

import { writeFileSync } from "fs"
import { Code, RawModule } from "../types"
import { exec } from 'child_process'
import { promisify } from 'util'
import { createRawModule } from "./JavaScriptEngine"
const execPromise = promisify(exec)

export const jsCodeToRawModule = async (code: Code): Promise<RawModule> => {
    try {
        return createRawModule(code) as any
    } catch (err) {
        const errMessage = await getJSEvalErrorSite(code)
        throw new Error('ERROR in generated JS code ' + errMessage)
    }
}

/** Hack to try to get the error line of evaled JS code */
const getJSEvalErrorSite = async (code: string) => {
    const filepath = '/tmp/file.mjs'
    writeFileSync(filepath, code)
    try {
        await execPromise('node --experimental-vm-modules ' + filepath)
    } catch (error) {
        const matched = new RegExp(`${filepath}:([0-9]+)`).exec(error.stack)
        if (matched) {
            const lineNumber = parseInt(matched[1], 10)
            const lineBefore = Math.max(lineNumber - 3, 0)
            const lineAfter = lineNumber + 3
            const codeLines = code
                .split('\n')
                .map((line, i) =>
                    i + 1 === lineNumber ? '-> ' + line + ' <-' : '  ' + line
                )
            return (
                `line ${lineNumber} : \n` +
                codeLines.slice(lineBefore, lineAfter).join('\n') +
                '\n-----\n' +
                error.toString()
            )
        } else {
            console.warn(`couldn't parse error line`)
            return (
                `copy/pasting node command stacktrace : \n` + error.toString()
            )
        }
    }
    console.warn(`no error found :thinking:`)
    return ''
}
