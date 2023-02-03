/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { DspGraph } from '@webpd/dsp-graph'
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
