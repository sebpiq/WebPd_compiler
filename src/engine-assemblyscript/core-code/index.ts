import {
    FS_OPERATION_FAILURE,
    FS_OPERATION_SUCCESS,
    MSG_DATUM_TYPE_FLOAT,
    MSG_DATUM_TYPE_STRING,
} from '../../constants'
import { Code, EngineVariableNames } from '../../types'
import { MSG_DATUM_TYPES_ASSEMBLYSCRIPT } from '../constants'
import MSG_ASC from './msg.asc'
import TARRAY_ASC from './tarray.asc'
import FS_ASC from './fs.asc'

export const replacePlaceholders = (
    engineVariableNames: EngineVariableNames,
    code: Code
) => {
    const { FloatType, FloatArrayType, getFloat, setFloat } =
        engineVariableNames.types
    return code
        .replaceAll('${FloatType}', FloatType)
        .replaceAll('${FloatArrayType}', FloatArrayType)
        .replaceAll('${getFloat}', getFloat)
        .replaceAll('${setFloat}', setFloat)
        .replaceAll('${FS_OPERATION_SUCCESS}', FS_OPERATION_SUCCESS.toString())
        .replaceAll('${FS_OPERATION_FAILURE}', FS_OPERATION_FAILURE.toString())
        .replaceAll(
            '${MSG_DATUM_TYPE_FLOAT}',
            MSG_DATUM_TYPES_ASSEMBLYSCRIPT[
                MSG_DATUM_TYPE_FLOAT
            ].toString()
        )
        .replaceAll(
            '${MSG_DATUM_TYPE_STRING}',
            MSG_DATUM_TYPES_ASSEMBLYSCRIPT[
                MSG_DATUM_TYPE_STRING
            ].toString()
        )
}

export const generate = (engineVariableNames: EngineVariableNames) => {
    return (
        replacePlaceholders(engineVariableNames, TARRAY_ASC) +
        replacePlaceholders(engineVariableNames, MSG_ASC) +
        replacePlaceholders(engineVariableNames, FS_ASC)
    )
}