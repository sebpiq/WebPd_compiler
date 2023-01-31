import { CodeVariableNames } from '../../types'
import CORE_ASC from './core.asc'
import BUF_ASC from './buf.asc'
import SKED_ASC from './sked.asc'
import MSG_ASC from './msg.asc'
import COMMONS_ASC from './commons.asc'
import FS_ASC from './fs.asc'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

// TODO : no need for the whole codeVariableNames here
export default (codeVariableNames: CodeVariableNames) => {
    return (
        replaceCoreCodePlaceholders(codeVariableNames, CORE_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, BUF_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, SKED_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, COMMONS_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, MSG_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, FS_ASC)
    )
}
