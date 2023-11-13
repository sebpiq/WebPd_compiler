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

import { isGlobalDefinitionWithSettings } from './compile-helpers'
import {
    GlobalCodeDefinition,
    GlobalCodeGenerator,
    GlobalCodeGeneratorContext,
} from './types'
import { AstElement } from '../ast/types'

export default (
    context: GlobalCodeGeneratorContext,
    dependencies: Array<GlobalCodeDefinition>
): Array<AstElement> =>
    // De-duplicate code
    _flattenDependencies(dependencies)
        .reduce<Array<GlobalCodeDefinition>>(
            (codeDefinitions, codeDefinition) =>
                !codeDefinitions.includes(codeDefinition)
                    ? [...codeDefinitions, codeDefinition]
                    : codeDefinitions,
            []
        )
        .map((codeDefinition) =>
            isGlobalDefinitionWithSettings(codeDefinition)
                ? codeDefinition.codeGenerator(context)
                : codeDefinition(context)
        )

export const _flattenDependencies = (
    dependencies: Array<GlobalCodeDefinition>
): Array<GlobalCodeGenerator> =>
    dependencies.flatMap<GlobalCodeGenerator>((codeDefinition) => {
        if (
            isGlobalDefinitionWithSettings(codeDefinition) &&
            codeDefinition.dependencies
        ) {
            return [
                ..._flattenDependencies(codeDefinition.dependencies),
                codeDefinition.codeGenerator,
            ]
        } else if (isGlobalDefinitionWithSettings(codeDefinition)) {
            return [codeDefinition.codeGenerator]
        } else {
            return [codeDefinition]
        }
    })
