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
import assert from "assert"
import { assertFuncSignatureEqual } from "./ast-helpers"
import { AnonFunc, Var } from "./declare"

describe('ast-helpers', () => {
    describe('assertFuncSignatureEqual', () => {
        it('should throw if actual is not an ast Func', () => {
            assert.throws(() => assertFuncSignatureEqual(1 as any, AnonFunc()``))
        })

        it('should throw if functions dont have the same arguments type or count', () => {
            assert.throws(() => assertFuncSignatureEqual(
                AnonFunc([Var('Int', 'bla')])``, 
                AnonFunc([Var('Float', 'bla')])``
            ))
            assert.throws(() => assertFuncSignatureEqual(
                AnonFunc([Var('Int', 'bla'), Var('Int', 'blo')])``, 
                AnonFunc([Var('Int', 'bla')])``
            ))
        })

        it('should throw if functions dont have the same return type', () => {
            assert.throws(() => assertFuncSignatureEqual(
                AnonFunc([Var('Int', 'bla')], 'Int')``, 
                AnonFunc([Var('Int', 'bla')], 'Float')``
            ))
        })

        it('should not throw if functions have different argument names', () => {
            assert.doesNotThrow(() => assertFuncSignatureEqual(
                AnonFunc([Var('Int', 'bla')])``, 
                AnonFunc([Var('Int', 'blo')])``
            ))
        })

        it('should not throw if functions have the same signature', () => {
            assert.doesNotThrow(() => assertFuncSignatureEqual(
                AnonFunc([Var('Int', 'bla'), Var('Array<Bla>', 'blo')], 'string')``, 
                AnonFunc([Var('Int', 'bla'), Var('Array<Bla>', 'blo')], 'string')``
            ))
        })
    })
})