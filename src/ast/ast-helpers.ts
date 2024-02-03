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
import { AstFunc } from './types'

/**
 * Helper to assert that two given AST functions have the same signature.
 */
export const assertFuncSignatureEqual = (
    actual: AstFunc,
    expected: AstFunc
) => {
    if (typeof actual !== 'object' || actual.astType !== 'Func') {
        throw new Error(`Expected an ast Func, got : ${actual}`)
    } else if (
        actual.args.length !== expected.args.length ||
        actual.args.some((arg, i) => {
            const expectedArg = expected.args[i]
            return !expectedArg || arg.type !== expectedArg.type
        }) ||
        actual.returnType !== expected.returnType
    ) {
        throw new Error(
            `Func should be have signature ${_printFuncSignature(expected)}` +
                ` got instead ${_printFuncSignature(actual)}`
        )
    }
    return actual
}

const _printFuncSignature = (func: AstFunc) =>
    `(${func.args.map((arg) => `${arg.name}: ${arg.type}`).join(', ')}) => ${
        func.returnType
    }`
