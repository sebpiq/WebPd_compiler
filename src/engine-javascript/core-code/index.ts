import { replaceCoreCodePlaceholders } from '../../compile-helpers'
import { CodeVariableNames } from '../../types'
import BUF_JS from './buf.generated.js.txt'
import SKED_JS from './sked.generated.js.txt'
import FS_JS from './fs.generated.js.txt'
import COMMONS_JS from './commons.generated.js.txt'

const CORE = `
const i32 = (v) => v
const f32 = i32
const f64 = i32
const toInt = (v) => v
const toFloat = (v) => v
const createFloatArray = (length) => 
    new \${FloatArray}(length)
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

// TODO : no need for the whole codeVariableNames here
export default (codeVariableNames: CodeVariableNames) => {
    return replaceCoreCodePlaceholders(
        codeVariableNames,
        CORE + BUF_JS + SKED_JS + COMMONS_JS + MSG + FS_JS
    )
}
