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

import { DspGraph } from '../dsp-graph'
import { renderCode } from '../functional-helpers'
import { Code, CodeVariableName, Compilation } from '../types'

export const compileOutletListeners = (
    { outletListenerSpecs, codeVariableNames }: Compilation,
    generateCode: (
        variableName: CodeVariableName,
        nodeId: DspGraph.NodeId,
        outletId: DspGraph.PortletId
    ) => Code
) =>
    renderCode`${Object.entries(outletListenerSpecs).map(
        ([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const listenerVariableName =
                    codeVariableNames.outletListeners[nodeId][outletId]
                return generateCode(listenerVariableName, nodeId, outletId)
            })
    )}`

export const compileInletCallers = ({
    inletCallerSpecs,
    codeVariableNames,
    macros: { Var, Func },
}: Compilation) =>
    // Here not possible to assign directly the receiver because otherwise assemblyscript
    // doesn't export a function but a global instead.
    renderCode`${Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
        inletIds.map(
            (inletId) =>
                `function ${
                    codeVariableNames.inletCallers[nodeId][inletId]
                } ${Func([Var('m', 'Message')], 'void')} {${
                    codeVariableNames.nodes[nodeId].rcvs[inletId]
                }(m)}`
        )
    )}`
