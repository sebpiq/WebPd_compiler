import { replaceCoreCodePlaceholders } from '../../compile-helpers'
import { EngineVariableNames } from '../../types'
import FS_JS from './fs.generated.js'

const COMPAT = `
const i32 = (v) => v
const f32 = i32
const f64 = i32
`

const MSG = `
const MSG_TOKEN_TYPE_FLOAT = \${MSG_TOKEN_TYPE_FLOAT}
const MSG_TOKEN_TYPE_STRING = \${MSG_TOKEN_TYPE_STRING}

const msg_create = () => []

const msg_getLength = (m) => m.length

const msg_getTokenType = (m, i) => typeof m[i]

const msg_isStringToken = (m, i) => msg_getTokenType(m, i) === 'string'

const msg_isFloatToken = (m, i) => msg_getTokenType(m, i) === 'number'

const msg_writeStringToken = msg_writeFloatToken = ( m, i, v ) =>
    m[i] = v

const msg_readStringToken = msg_readFloatToken = ( m, i ) =>
    m[i]
`

const FS = `
const fs_requestReadSoundFile = (...args) => exports.fs.onRequestReadSoundFile(...args)
const fs_requestReadSoundStream = (...args) => exports.fs.onRequestReadSoundStream(...args)
// const fs_requestWriteSoundFile = (...args) => exports.fs.onRequestWriteSoundFile(...args)
const fs_requestCloseSoundStream = (...args) => exports.fs.onRequestCloseSoundStream(...args)
`

export default (engineVariableNames: EngineVariableNames) => {
    return replaceCoreCodePlaceholders(
        engineVariableNames,
        COMPAT + MSG + FS + FS_JS
    )
}
