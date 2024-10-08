/*
 * Copyright (c) 2022-2023 Sébastien Piquemal <sebpiq@protonmail.com>, Chris McCormick.
 *
 * This file is part of WebPd
 * (see https://github.com/sebpiq/WebPd).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { GlobalDefinitions } from '../../compile/types'
import { Sequence, Func, Var } from '../../ast/declare'
import { CoreExportsAssemblyScript, CoreNamespaceAll } from './types'

const NAMESPACE = 'core'

export const core: GlobalDefinitions<
    keyof CoreNamespaceAll,
    keyof CoreExportsAssemblyScript
> = {
    namespace: NAMESPACE,

    // prettier-ignore
    code: ({ ns: core }, _, { target, audio: { bitDepth } }) => {
        const Int = 'i32'
        const Float = bitDepth === 32 ? 'f32' : 'f64'
        const FloatArray = bitDepth === 32 ? 'Float32Array' : 'Float64Array'
        const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
        const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
        const declareFuncs = {
            toInt: Func(core.toInt, [Var(`Float`, `v`)], `Int`),
            toFloat: Func(core.toFloat, [Var(`Int`, `v`)], `Float`),
            createFloatArray: Func(core.createFloatArray, [Var(`Int`, `length`)], `FloatArray`),
            setFloatDataView: Func(core.setFloatDataView, [
                Var(`DataView`, `dataView`), 
                Var(`Int`, `position`), 
                Var(`Float`, `value`), 
            ], 'void'),
            getFloatDataView: Func(core.getFloatDataView, [
                Var(`DataView`, `dataView`), 
                Var(`Int`, `position`), 
            ], 'Float')
        }

        const shared = [
            Var(`Int`, core.IT_FRAME, `0`),
            Var(`Int`, core.FRAME, `0`),
            Var(`Int`, core.BLOCK_SIZE, `0`),
            Var(`Float`, core.SAMPLE_RATE, `0`),
            Var(`Float`, core.NULL_SIGNAL, `0`),
            Var(`FloatArray`, core.INPUT, `createFloatArray(0)`),
            Var(`FloatArray`, core.OUTPUT, `createFloatArray(0)`),
        ]

        if (target === 'assemblyscript') {
            return Sequence([
                `
                type FloatArray = ${FloatArray}
                type Float = ${Float}
                type Int = ${Int}
                `,
                declareFuncs.toInt`
                    return ${Int}(v)
                `,
                declareFuncs.toFloat`
                    return ${Float}(v)
                `,
                declareFuncs.createFloatArray`
                    return new ${FloatArray}(length)
                `,
                declareFuncs.setFloatDataView`
                    dataView.${setFloat}(position, value)
                `,
                declareFuncs.getFloatDataView`
                    return dataView.${getFloat}(position)
                `,

                // =========================== EXPORTED API
                Func(core.x_createListOfArrays, [], 'FloatArray[]')`
                    const arrays: FloatArray[] = []
                    return arrays
                `,

                Func(core.x_pushToListOfArrays, [
                    Var(`FloatArray[]`, `arrays`), 
                    Var(`FloatArray`, `array`)
                ], 'void')`
                    arrays.push(array)
                `,

                Func(core.x_getListOfArraysLength, [
                    Var(`FloatArray[]`, `arrays`)
                ], 'Int')`
                    return arrays.length
                `,

                Func(core.x_getListOfArraysElem, [
                    Var(`FloatArray[]`, `arrays`), 
                    Var(`Int`, `index`)
                ], 'FloatArray')`
                    return arrays[index]
                `,
                
                Func(core.x_getInput,[], 'FloatArray')`
                    return ${core.INPUT}
                `,
                Func(core.x_getOutput,[], 'FloatArray')`
                    return ${core.OUTPUT}
                `,

                ...shared,
            ])
        } else if (target === 'javascript') {
            return Sequence([
                `
                const i32 = (v) => v
                const f32 = i32
                const f64 = i32
                `,
                declareFuncs.toInt`
                    return v
                `,
                declareFuncs.toFloat`
                    return v
                `,
                declareFuncs.createFloatArray`
                    return new ${FloatArray}(length)
                `,
                declareFuncs.setFloatDataView`
                    dataView.${setFloat}(position, value)
                `,
                declareFuncs.getFloatDataView`
                    return dataView.${getFloat}(position)
                `,

                ...shared,
            ])
        } else {
            throw new Error(`Unexpected target: ${target}`)
        }
    },

    exports: ({ ns: core }, _, { target }) =>
        target === 'assemblyscript'
            ? [
                  core.x_createListOfArrays,
                  core.x_pushToListOfArrays,
                  core.x_getListOfArraysLength,
                  core.x_getListOfArraysElem,
                  core.x_getInput,
                  core.x_getOutput,
                  core.createFloatArray,
              ]
            : [],
}
