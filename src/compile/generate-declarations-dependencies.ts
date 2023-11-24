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

import { getGlobalCodeGeneratorContext, isGlobalDefinitionWithSettings } from './compile-helpers'
import {
    Compilation,
    GlobalCodeDefinition,
    GlobalCodeGenerator,
} from './types'
import { AstElement } from '../ast/types'
import deepEqual from 'deep-equal'

export default (
    compilation:Compilation,
    dependencies: Array<GlobalCodeDefinition>
): Array<AstElement> => {
    const context = getGlobalCodeGeneratorContext(compilation)
    return _flattenDependencies(dependencies)
        .map((codeGenerator) => codeGenerator(context))
        // De-duplicate dependencies by comparing generated AST
        .reduce<Array<AstElement>>(
            (astElements, astElement) =>
                astElements.every(
                    (otherElement) =>
                        !deepEqual(otherElement, astElement, { strict: true })
                )
                    ? [...astElements, astElement]
                    : astElements,
            []
        )
}

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
