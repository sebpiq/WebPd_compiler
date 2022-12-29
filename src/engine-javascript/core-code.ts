const COMPAT = `
const i32 = (v) => v
const f32 = i32
const f64 = i32
`

const MSG = `
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

const CORE_CODE = COMPAT + MSG

export default CORE_CODE