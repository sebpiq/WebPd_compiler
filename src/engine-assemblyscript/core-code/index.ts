import { CodeVariableNames } from '../../types'
import CORE_ASC from './core.asc'
import MSG_ASC from './msg.asc'
import TARRAY_ASC from './tarray.asc'
import FS_ASC from './fs.asc'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

export default (codeVariableNames: CodeVariableNames) => {
    return (
        replaceCoreCodePlaceholders(codeVariableNames, CORE_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, TARRAY_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, MSG_ASC) +
        replaceCoreCodePlaceholders(codeVariableNames, FS_ASC)
    )
}
