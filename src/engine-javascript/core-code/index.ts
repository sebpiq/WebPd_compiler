import { replaceCoreCodePlaceholders } from '../../compile-helpers'
import { EngineVariableNames } from '../../types'
import FS_JS from './fs.generated.js'

const COMPAT = `
const i32 = (v) => v
const f32 = i32
const f64 = i32
`

const MSG = `
const MSG_DATUM_TYPE_FLOAT = \${MSG_DATUM_TYPE_FLOAT}
const MSG_DATUM_TYPE_STRING = \${MSG_DATUM_TYPE_STRING}

const msg_create = () => []

const msg_getLength = (m) => m.length

const msg_getDatumType = (m, i) => typeof m[i]

const msg_isStringToken = (m, i) => msg_getDatumType(m, i) === 'string'

const msg_isFloatToken = (m, i) => msg_getDatumType(m, i) === 'number'

const msg_writeStringDatum = msg_writeFloatDatum = ( m, i, v ) =>
    m[i] = v

const msg_readStringDatum = msg_readFloatDatum = ( m, i ) =>
    m[i]
`

const FS = `
const fs_requestReadSoundFile = (...args) => exports.fs.onRequestReadSoundFile(...args)
// const fs_requestReadSoundStream = (...args) => exports.fs.onRequestReadSoundStream(...args)
// const fs_requestWriteSoundFile = (...args) => exports.fs.onRequestWriteSoundFile(...args)
// const fs_requestCloseSoundStream = (...args) => exports.fs.onRequestCloseSoundStream(...args)
`

export default (engineVariableNames: EngineVariableNames) => {
    return replaceCoreCodePlaceholders(
        engineVariableNames,
        COMPAT + MSG + FS + FS_JS
    )
}
