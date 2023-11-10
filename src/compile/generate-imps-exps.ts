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

// WARNING : for some reason naming this file `generate-imports-exports.ts`
// failed tests in WebPd package, that's why it's named like this.

import { collectImports, collectExports } from './compile-helpers'
import {
    GlobalCodeDefinitionImport,
    GlobalCodeDefinition,
    CompilerTarget,
} from './types'
import { AstContainer } from '../ast/types'
import { Ast } from '../ast/declare'

type GenerateImportExportFunction = (imprt: GlobalCodeDefinitionImport) => AstContainer

export default (
    target: CompilerTarget,
    dependencies: Array<GlobalCodeDefinition>,
    generateImport: GenerateImportExportFunction,
    generateExport: GenerateImportExportFunction
): AstContainer =>
    // prettier-ignore
    Ast`
        ${collectImports(dependencies).map(generateImport)}
        ${collectExports(target, dependencies).map(generateExport)}
    `
