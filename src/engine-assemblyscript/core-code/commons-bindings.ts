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

import {
    core_WasmExports,
} from './core-bindings'
import { StringPointer, FloatArrayPointer } from '../types'

export interface commons_WasmExports extends core_WasmExports {
    commons_getArray: (arrayName: StringPointer) => FloatArrayPointer
    commons_setArray: (arrayName: StringPointer, array: FloatArrayPointer) => void
}