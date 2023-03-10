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
import { replaceCoreCodePlaceholders } from '../../compile-helpers'
import { AudioSettings } from '../../types'
import BUF_JS from './buf.generated.js.txt'
import SKED_JS from './sked.generated.js.txt'
import FS_JS from './fs.generated.js.txt'
import COMMONS_JS from './commons.generated.js.txt'
import { FS_OPERATION_FAILURE, FS_OPERATION_SUCCESS } from '../../constants'

const CORE = `
const i32 = (v) => v
const f32 = i32
const f64 = i32
const toInt = (v) => v
const toFloat = (v) => v
const createFloatArray = (length) => 
    new \${FloatArray}(length)
const setFloatDataView = (d, p, v) => d.\${setFloat}(p, v)
const getFloatDataView = (d, p) => d.\${getFloat}(p)
const FS_OPERATION_SUCCESS = ${FS_OPERATION_SUCCESS}
const FS_OPERATION_FAILURE = ${FS_OPERATION_FAILURE}
`

const MSG = `
const MSG_FLOAT_TOKEN = "number"
const MSG_STRING_TOKEN = "string"
const msg_create = () => []
const msg_getLength = (m) => m.length
const msg_getTokenType = (m, i) => typeof m[i]
const msg_isStringToken = (m, i) => msg_getTokenType(m, i) === 'string'
const msg_isFloatToken = (m, i) => msg_getTokenType(m, i) === 'number'
const msg_isMatching = (m, tokenTypes) => {
    return (m.length === tokenTypes.length) 
        && m.every((v, i) => msg_getTokenType(m, i) === tokenTypes[i])
}
const msg_writeFloatToken = ( m, i, v ) => m[i] = v
const msg_writeStringToken = msg_writeFloatToken
const msg_readFloatToken = ( m, i ) => m[i]
const msg_readStringToken = msg_readFloatToken
const msg_floats = (v) => v
const msg_strings = (v) => v
const msg_display = (m) => '[' + m
    .map(t => typeof t === 'string' ? '"' + t + '"' : t.toString())
    .join(', ') + ']'
`

export default (bitDepth: AudioSettings['bitDepth']) => {
    return (
        replaceCoreCodePlaceholders(bitDepth, CORE) +
        BUF_JS +
        SKED_JS +
        COMMONS_JS +
        MSG +
        FS_JS
    )
}
