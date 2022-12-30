import { EngineVariableNames } from '../../types'
import CORE_ASC from './core.asc'
import MSG_ASC from './msg.asc'
import TARRAY_ASC from './tarray.asc'
import FS_ASC from './fs.asc'
import { replaceCoreCodePlaceholders } from '../../compile-helpers'

export default (engineVariableNames: EngineVariableNames) => {
    return (
        replaceCoreCodePlaceholders(engineVariableNames, CORE_ASC) +
        replaceCoreCodePlaceholders(engineVariableNames, TARRAY_ASC) +
        replaceCoreCodePlaceholders(engineVariableNames, MSG_ASC) +
        replaceCoreCodePlaceholders(engineVariableNames, FS_ASC)
    )
}
