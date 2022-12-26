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

import { EngineVariableNames, AccessorSpecs, AudioSettings } from '../types'

export const attachAccessors = (
    engineVariableNames: EngineVariableNames,
    accessorSpecs: AccessorSpecs
): void => {
    Object.entries(accessorSpecs).forEach(([variableName, accessorSpec]) => {
        engineVariableNames.accessors[variableName] = {}
        const accessorsNames = engineVariableNames.accessors[variableName]
        if (accessorSpec.access.includes('r')) {
            if (accessorSpec.type === 'message') {
                // Implemented by engine
                accessorsNames['r_length'] = `read_${variableName}_length`
                accessorsNames['r_elem'] = `read_${variableName}_elem`
                // Implemented by bindings
                accessorsNames['r'] = `read_${variableName}`
            } else {
                accessorsNames['r'] = `read_${variableName}`
            }
        }
        if (accessorSpec.access.includes('w')) {
            accessorsNames['w'] = `write_${variableName}`
        }
    })
}