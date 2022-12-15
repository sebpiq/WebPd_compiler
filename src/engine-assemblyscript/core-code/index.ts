import {
    MESSAGE_DATUM_TYPE_FLOAT,
    MESSAGE_DATUM_TYPE_STRING,
} from '../../constants'
import { Code, EngineVariableNames } from '../../types'
import { MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT } from '../constants'
import MSG_ASC from './msg.asc'
import TARRAY_ASC from './tarray.asc'

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
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_FLOAT}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_FLOAT
            ].toString()
        )
        .replaceAll(
            '${MESSAGE_DATUM_TYPE_STRING}',
            MESSAGE_DATUM_TYPES_ASSEMBLYSCRIPT[
                MESSAGE_DATUM_TYPE_STRING
            ].toString()
        )
}

export const generate = (engineVariableNames: EngineVariableNames) => {
    return (
        replacePlaceholders(engineVariableNames, TARRAY_ASC) +
        replacePlaceholders(engineVariableNames, MSG_ASC)
    )
}
