import { CodeVariableNames } from '../../types'
import CORE_ASC from './core.asc'
import BUF_ASC from './buf.asc'
import MSG_ASC from './msg.asc'
import FARRAY_ASC from './farray.asc'
import FS_ASC from './fs.asc'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

export default (codeVariableNames: CodeVariableNames) => {
    return (
        replaceCoreCodePlaceholders(codeVariableNames, CORE_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, BUF_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, FARRAY_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, MSG_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, FS_ASC)
    )
}
