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

import { renderCode, renderSwitch } from '../functional-helpers'
import { GlobalCodeGeneratorWithSettings } from '../compile/types'

export const core: GlobalCodeGeneratorWithSettings = {
    codeGenerator: ({ target, audioSettings: { bitDepth } }) => {
        const Int = 'i32'
        const Float = bitDepth === 32 ? 'f32' : 'f64'
        const FloatArray = bitDepth === 32 ? 'Float32Array' : 'Float64Array'
        const getFloat = bitDepth === 32 ? 'getFloat32' : 'getFloat64'
        const setFloat = bitDepth === 32 ? 'setFloat32' : 'setFloat64'
        return renderCode`${renderSwitch(
            [
                target === 'assemblyscript',
                `
                    type FloatArray = ${FloatArray}
                    type Float = ${Float}
                    type Int = ${Int}

                    function toInt (v: Float): Int { return ${Int}(v) }
                    function toFloat (v: Int): Float { return ${Float}(v) }
                    function createFloatArray (length: Int): FloatArray {
                        return new ${FloatArray}(length)
                    }
                    function setFloatDataView (
                        dataView: DataView, 
                        position: Int, 
                        value: Float,
                    ): void { dataView.${setFloat}(position, value) }
                    function getFloatDataView (
                        dataView: DataView, 
                        position: Int, 
                    ): Float { return dataView.${getFloat}(position) }

                    // =========================== EXPORTED API
                    function x_core_createListOfArrays(): FloatArray[] {
                        const arrays: FloatArray[] = []
                        return arrays
                    }

                    function x_core_pushToListOfArrays(arrays: FloatArray[], array: FloatArray): void {
                        arrays.push(array)
                    }

                    function x_core_getListOfArraysLength(arrays: FloatArray[]): Int {
                        return arrays.length
                    }

                    function x_core_getListOfArraysElem(arrays: FloatArray[], index: Int): FloatArray {
                        return arrays[index]
                    }
                `,
            ],

            [
                target === 'javascript',
                `
                    const i32 = (v) => v
                    const f32 = i32
                    const f64 = i32
                    const toInt = (v) => v
                    const toFloat = (v) => v
                    const createFloatArray = (length) => 
                        new ${FloatArray}(length)
                    const setFloatDataView = (d, p, v) => d.${setFloat}(p, v)
                    const getFloatDataView = (d, p) => d.${getFloat}(p)
                `,
            ]
        )}`
    },

    exports: [
        { name: 'x_core_createListOfArrays', targets: ['assemblyscript'] },
        { name: 'x_core_pushToListOfArrays', targets: ['assemblyscript'] },
        { name: 'x_core_getListOfArraysLength', targets: ['assemblyscript'] },
        { name: 'x_core_getListOfArraysElem', targets: ['assemblyscript'] },
        { name: 'createFloatArray', targets: ['assemblyscript'] },
    ],
}
