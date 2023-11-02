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
import { GlobalCodeDefinition, GlobalCodeGeneratorContext, Code } from './types'

export default (
    context: GlobalCodeGeneratorContext,
    dependencies: Array<GlobalCodeDefinition>
) =>
    // De-duplicate code
    _generateDependenciesDeclarationsRecursive(context, dependencies)
        .reduce<Array<Code>>(
            (codes, code) => (!codes.includes(code) ? [...codes, code] : codes),
            []
        )
        .join('\n')

export const _generateDependenciesDeclarationsRecursive = (
    context: GlobalCodeGeneratorContext,
    dependencies: Array<GlobalCodeDefinition>
): Array<Code> =>
    dependencies.flatMap(
        (globalCodeDefinition): Array<Code> =>
            isGlobalDefinitionWithSettings(globalCodeDefinition)
                ? [
                      ...(globalCodeDefinition.dependencies
                          ? _generateDependenciesDeclarationsRecursive(
                                context,
                                globalCodeDefinition.dependencies
                            )
                          : []),
                      globalCodeDefinition.codeGenerator(context),
                  ]
                : [globalCodeDefinition(context)]
    )
