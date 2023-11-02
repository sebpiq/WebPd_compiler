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
import { getFloatArrayType } from '../run/run-helpers'
import { renderCode } from '../functional-helpers'
import { Compilation } from './types'

/**
 * Embed arrays passed to the compiler in the compiled module.
 */
export default (compilation: Compilation) => renderCode`
    ${Object.entries(compilation.arrays).map(
        ([arrayName, array]) => `
        commons_setArray("${arrayName}", new ${
            getFloatArrayType(compilation.audioSettings.bitDepth).name
        }(${array.length}))
        commons_getArray("${arrayName}").set(${JSON.stringify(
            Array.from(array)
        )})
    `
    )}
`
