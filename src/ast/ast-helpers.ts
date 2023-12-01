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
        actual.args.some((arg, i) => arg.type !== expected.args[i].type) ||
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
