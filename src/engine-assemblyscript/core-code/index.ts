import { AudioSettings } from '../../types'
import CORE_ASC from './core.asc'
import BUF_ASC from './buf.asc'
import SKED_ASC from './sked.asc'
import MSG_ASC from './msg.asc'
import COMMONS_ASC from './commons.asc'
import FS_ASC from './fs.asc'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

export default (bitDepth: AudioSettings['bitDepth']) => {
    return (
        replaceCoreCodePlaceholders(bitDepth, CORE_ASC) +
        BUF_ASC +
        SKED_ASC +
        COMMONS_ASC +
        MSG_ASC +
        FS_ASC
    )
}
