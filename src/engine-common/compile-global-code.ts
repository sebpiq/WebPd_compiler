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

import {
    GlobalCodeDefinition,
    GlobalCodeGeneratorContext,
    Code,
    GlobalCodeGeneratorWithSettings,
    GlobalCodeDefinitionExport,
    GlobalCodeDefinitionImport,
    CompilerTarget,
} from '../types'

export default (
    context: GlobalCodeGeneratorContext,
    globalCodeDefinitions: Array<GlobalCodeDefinition>
) =>
    // De-duplicate code
    _renderCodeDefinitionsRecursive(context, globalCodeDefinitions)
        .reduce<Array<Code>>(
            (codes, code) => (!codes.includes(code) ? [...codes, code] : codes),
            []
        )
        .join('\n')

export const _renderCodeDefinitionsRecursive = (
    context: GlobalCodeGeneratorContext,
    globalCodeDefinitions: Array<GlobalCodeDefinition>
): Array<Code> =>
    globalCodeDefinitions.flatMap(
        (globalCodeDefinition): Array<Code> =>
            _isGlobalDefinitionWithSettings(globalCodeDefinition)
                ? [
                      ...(globalCodeDefinition.dependencies
                          ? _renderCodeDefinitionsRecursive(
                                context,
                                globalCodeDefinition.dependencies
                            )
                          : []),
                      globalCodeDefinition.codeGenerator(context),
                  ]
                : [globalCodeDefinition(context)]
    )

export const collectExports = (
    target: CompilerTarget,
    globalCodeDefinitions: Array<GlobalCodeDefinition>
): Array<GlobalCodeDefinitionExport> =>
    _collectExportsRecursive(globalCodeDefinitions)
        .filter((xprt) => !xprt.targets || xprt.targets.includes(target))
        .reduce<Array<GlobalCodeDefinitionExport>>(
            // De-duplicate exports
            (exports, xprt) =>
                exports.some((otherExport) => xprt.name === otherExport.name)
                    ? exports
                    : [...exports, xprt],
            []
        )

export const collectImports = (
    globalCodeDefinitions: Array<GlobalCodeDefinition>
): Array<GlobalCodeDefinitionImport> =>
    _collectImportsRecursive(globalCodeDefinitions).reduce<
        Array<GlobalCodeDefinitionImport>
    >(
        // De-duplicate imports
        (imports, imprt) =>
            imports.some((otherImport) => imprt.name === otherImport.name)
                ? imports
                : [...imports, imprt],
        []
    )

const _collectExportsRecursive = (
    globalCodeDefinitions: Array<GlobalCodeDefinition>
) =>
    globalCodeDefinitions
        .filter(_isGlobalDefinitionWithSettings)
        .flatMap(
            (
                globalCodeDefinition: GlobalCodeGeneratorWithSettings
            ): Array<GlobalCodeDefinitionExport> => [
                ...(globalCodeDefinition.dependencies
                    ? _collectExportsRecursive(
                          globalCodeDefinition.dependencies
                      )
                    : []),
                ...(globalCodeDefinition.exports || []),
            ]
        )

const _collectImportsRecursive = (
    globalCodeDefinitions: Array<GlobalCodeDefinition>
) =>
    globalCodeDefinitions
        .filter(_isGlobalDefinitionWithSettings)
        .flatMap(
            (
                globalCodeDefinition: GlobalCodeGeneratorWithSettings
            ): Array<GlobalCodeDefinitionImport> => [
                ...(globalCodeDefinition.dependencies
                    ? _collectImportsRecursive(
                          globalCodeDefinition.dependencies
                      )
                    : []),
                ...(globalCodeDefinition.imports || []),
            ]
        )

const _isGlobalDefinitionWithSettings = (
    globalCodeDefinition: GlobalCodeDefinition
): globalCodeDefinition is GlobalCodeGeneratorWithSettings =>
    !(typeof globalCodeDefinition === 'function')
