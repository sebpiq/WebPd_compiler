/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { Code, CodeMacros, CodeVariableName } from '../types'

const Var = (name: CodeVariableName, typeString: Code) =>
    `${name}: ${typeString}`

const Func = (args: Array<Code>, returnType: Code) =>
    `(${args.join(', ')}): ${returnType}`

const macros: CodeMacros = {
    Var,
    Func,
}

export default macros
