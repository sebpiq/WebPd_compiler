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
export { default as default } from './compile'
export {
    UserCompilationSettings as CompilationSettings,
    NodeImplementations,
    CompilerTarget,
    AudioSettings,
} from './compile/types'
export { Code } from './ast/types'
export { FS_OPERATION_SUCCESS, FS_OPERATION_FAILURE } from './stdlib/fs'
export { Engine, Message, FloatArray } from './run/types'
export { createEngine as createAssemblyScriptWasmEngine } from './engine-assemblyscript/run'
export { createEngine as createJavaScriptEngine } from './engine-javascript/run'
export { readMetadata } from './run'
export { getFloatArrayType } from './run/run-helpers'
export { ProtectedIndex } from './compile/proxies'
export * as functional from './functional-helpers'
export * as dspGraph from './dsp-graph'
export { DspGraph } from './dsp-graph'
export * as stdlib from './stdlib'
export {
    Var,
    ConstVar,
    Func,
    ast,
    Class,
    AnonFunc,
    Sequence,
} from './ast/declare'
