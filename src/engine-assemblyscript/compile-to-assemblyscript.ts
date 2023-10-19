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

import { buildMetadata, collectGlobalCodeDefinitionsFromTraversal, engineMinimalCodeDefinitions } from '../compile-helpers'
import compileDeclare from '../engine-common/compile-declare'
import compileLoop from '../engine-common/compile-loop'
import { renderCode } from '../functional-helpers'
import { Compilation, GlobalCodeDefinitionExport, GlobalCodeDefinitionImport } from '../types'
import macros from './macros'
import { AssemblyScriptWasmEngineCode } from './types'
import {
    compileOutletListeners,
    compileInletCallers,
} from '../engine-common/compile-portlet-accessors'
import embedArrays from '../engine-common/embed-arrays'
import compileGlobalCode, { collectExports, collectImports } from '../engine-common/compile-global-code'

export default (compilation: Compilation): AssemblyScriptWasmEngineCode => {
    const { audioSettings, inletCallerSpecs, codeVariableNames } = compilation
    const { channelCount } = audioSettings
    const globs = compilation.codeVariableNames.globs
    const metadata = buildMetadata(compilation)
    const globalCodeDefinitions = [
        ...engineMinimalCodeDefinitions(),
        ...collectGlobalCodeDefinitionsFromTraversal(compilation),
    ]

    // prettier-ignore
    return renderCode`
        ${compileGlobalCode(compilation, globalCodeDefinitions)}

        ${embedArrays(compilation)}

        ${compileDeclare(compilation)}

        ${compileInletCallers(compilation)}
        
        ${compileOutletListeners(compilation, (variableName) => `
            export declare function ${variableName}(m: Message): void
        `)}

        const metadata: string = '${JSON.stringify(metadata)}'
        let ${globs.input}: FloatArray = createFloatArray(0)
        let ${globs.output}: FloatArray = createFloatArray(0)
        
        export function configure(sampleRate: Float, blockSize: Int): void {
            ${globs.input} = createFloatArray(blockSize * ${channelCount.in.toString()})
            ${globs.output} = createFloatArray(blockSize * ${channelCount.out.toString()})
            ${globs.sampleRate} = sampleRate
            ${globs.blockSize} = blockSize
            _commons_emitEngineConfigure()
        }

        export function getInput(): FloatArray { return ${globs.input} }

        export function getOutput(): FloatArray { return ${globs.output} }

        export function loop(): void {
            ${compileLoop(compilation)}
        }

        export {
            metadata,
            ${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) => 
                inletIds.map(inletId => 
                    codeVariableNames.inletCallers[nodeId][inletId] + ','
                )
            )}
        }

        ${collectImports(globalCodeDefinitions).map(compileImport)}
        ${collectExports('assemblyscript', globalCodeDefinitions).map(compileExport)}
    `
}

const compileImport = (
    { name, args, returns }: GlobalCodeDefinitionImport
) => `export declare function ${name} ${macros.Func(
        args.map((a) => macros.Var(a[0], a[1])),
        returns
    )}`

export const compileExport = (
    { name }: GlobalCodeDefinitionExport
) => `export { ${name} }`