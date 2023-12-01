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