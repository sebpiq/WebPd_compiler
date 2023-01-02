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

import { EngineVariableNames, AccessorSpecs } from '../types'

export const attachAccessors = (
    engineVariableNames: EngineVariableNames,
    accessorSpecs: AccessorSpecs
): void => {
    Object.entries(accessorSpecs).forEach(([variableName, accessorSpec]) => {
        engineVariableNames.accessors[variableName] = {}
        if (accessorSpec.access.includes('r')) {
            engineVariableNames.accessors[variableName][
                'r'
            ] = `read_${variableName}`
        }
        if (accessorSpec.access.includes('w')) {
            engineVariableNames.accessors[variableName][
                'w'
            ] = `write_${variableName}`
        }
    })
}
