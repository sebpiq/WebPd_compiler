/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { DspGraph } from '@webpd/dsp-graph'
import {
    FS_OPERATION_SUCCESS,
    FS_OPERATION_FAILURE,
    MSG_FLOAT_TOKEN,
    MSG_STRING_TOKEN,
} from './constants'
import { MSG_TOKEN_TYPES_ASSEMBLYSCRIPT } from './engine-assemblyscript/constants'
import {
    Code,
    CodeVariableNames,
    NodeImplementation,
    NodeImplementations,
} from './types'

type CodeLines = Array<CodeLines | Code>

/**
 * Helper to render code.
 * Allows to pass templated strings with arrays and arrays of arrays of codelines, adding new lines automatically.
 * @param strings
 * @param codeLines
 * @returns
 */
export const renderCode = (
    strings: TemplateStringsArray,
    ...codeLines: CodeLines
): Code => {
    let rendered: string = ''
    for (let i = 0; i < strings.length; i++) {
        rendered += strings[i]
        if (codeLines[i]) {
            rendered += renderCodeLines(codeLines[i])
        }
    }
    return rendered
}

const renderCodeLines = (codeLines: CodeLines | Code): Code => {
    if (Array.isArray(codeLines)) {
        return codeLines.map(renderCodeLines).join('\n')
    }
    return codeLines
}

/**
 * Helper to get node implementation or throw an error if not implemented.
 *
 * @param nodeImplementations
 * @param nodeType
 * @returns
 */
export const getNodeImplementation = (
    nodeImplementations: NodeImplementations,
    nodeType: DspGraph.NodeType
): NodeImplementation<DspGraph.NodeArguments> => {
    const nodeImplementation = nodeImplementations[nodeType]
    if (!nodeImplementation) {
        throw new Error(`node ${nodeType} is not implemented`)
    }
    return nodeImplementation
}

export const replaceCoreCodePlaceholders = (
    codeVariableNames: CodeVariableNames,
    code: Code
) => {
    const { Int, Float, FloatArray, getFloat, setFloat } =
        codeVariableNames.types
    return code
        .replaceAll('${Int}', Int)
        .replaceAll('${Float}', Float)
        .replaceAll('${FloatArray}', FloatArray)
        .replaceAll('${getFloat}', getFloat)
        .replaceAll('${setFloat}', setFloat)
        .replaceAll('${FS_OPERATION_SUCCESS}', FS_OPERATION_SUCCESS.toString())
        .replaceAll('${FS_OPERATION_FAILURE}', FS_OPERATION_FAILURE.toString())
        .replaceAll(
            '${MSG_FLOAT_TOKEN}',
            MSG_TOKEN_TYPES_ASSEMBLYSCRIPT[MSG_FLOAT_TOKEN].toString()
        )
        .replaceAll(
            '${MSG_STRING_TOKEN}',
            MSG_TOKEN_TYPES_ASSEMBLYSCRIPT[MSG_STRING_TOKEN].toString()
        )
}
