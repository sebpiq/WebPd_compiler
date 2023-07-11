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

import { getGlobalCodeGeneratorContext } from '../compile-helpers'
import { renderCode } from '../functional-helpers'
import {
    Compilation,
    GlobalCodeGeneratorWithSettings,
    GlobalCodeDefinition,
} from '../types'

export default (
    compilation: Compilation,
    globalCodeDefinitions: Array<GlobalCodeDefinition>
) => {
    const context = getGlobalCodeGeneratorContext(compilation)
    const globalCodeGeneratorsWithSettings: Array<GlobalCodeGeneratorWithSettings> =
        []
    return renderCode`
        ${globalCodeDefinitions.map((globalCodeDefinition) => {
            if (typeof globalCodeDefinition === 'function') {
                return globalCodeDefinition(context)
            } else {
                globalCodeGeneratorsWithSettings.push(globalCodeDefinition)
                return globalCodeDefinition.codeGenerator(context)
            }
        })}

        ${globalCodeGeneratorsWithSettings
            .filter((globalCodeDefinition) => globalCodeDefinition.exports)
            .map((globalCodeDefinition) =>
                globalCodeDefinition.exports.map((exprt) =>
                    exprt.codeGenerator(context)
                )
            )}

        ${globalCodeGeneratorsWithSettings
            .filter((globalCodeDefinition) => globalCodeDefinition.imports)
            .map((globalCodeDefinition) =>
                globalCodeDefinition.imports.map((imprt) =>
                    imprt.codeGenerator(context)
                )
            )}
    `
}
