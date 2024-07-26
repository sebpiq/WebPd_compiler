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

import { GlobalCodeGeneratorWithSettings } from '../compile/types'
import { Sequence, Func, Var } from '../ast/declare'

export const core: GlobalCodeGeneratorWithSettings = {
    // prettier-ignore
    codeGenerator: ({ settings: { target, audio: { bitDepth } }, globalCode }) => {
        const Int = 'i32'
        const Float = bitDepth === 32 ? 'f32' : 'f64'
        const FloatArray = bitDepth === 32 ? 'Float32Array' : 'Float64Array'
        const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
        const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
        const declareFuncs = {
            toInt: Func(globalCode.core!.toInt!, [Var('Float', 'v')], 'Int'),
            toFloat: Func(globalCode.core!.toFloat!, [Var('Int', 'v')], 'Float'),
            createFloatArray: Func(globalCode.core!.createFloatArray!, [Var('Int', 'length')], 'FloatArray'),
            setFloatDataView: Func(globalCode.core!.setFloatDataView!, [
                Var('DataView', 'dataView'), 
                Var('Int', 'position'), 
                Var('Float', 'value'), 
            ], 'void'),
            getFloatDataView: Func(globalCode.core!.getFloatDataView!, [
                Var('DataView', 'dataView'), 
                Var('Int', 'position'), 
            ], 'Float')
        }

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
                Func(globalCode.core!.x_createListOfArrays!, [], 'FloatArray[]')`
                    const arrays: FloatArray[] = []
                    return arrays
                `,

                Func(globalCode.core!.x_pushToListOfArrays!, [
                    Var('FloatArray[]', 'arrays'), 
                    Var('FloatArray', 'array')
                ], 'void')`
                    arrays.push(array)
                `,

                Func(globalCode.core!.x_getListOfArraysLength!, [
                    Var('FloatArray[]', 'arrays')
                ], 'Int')`
                    return arrays.length
                `,

                Func(globalCode.core!.x_getListOfArraysElem!, [
                    Var('FloatArray[]', 'arrays'), 
                    Var('Int', 'index')
                ], 'FloatArray')`
                    return arrays[index]
                `
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
            ])
        } else {
            throw new Error(`Unexpected target: ${target}`)
        }
    },

    exports: ({ settings: { target }, globalCode }) => target === 'assemblyscript' ? [
        globalCode.core!.x_createListOfArrays!,
        globalCode.core!.x_pushToListOfArrays!,
        globalCode.core!.x_getListOfArraysLength!,
        globalCode.core!.x_getListOfArraysElem!,
        globalCode.core!.createFloatArray!,
    ]: [],
}
