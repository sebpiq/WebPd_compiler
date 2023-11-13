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
import { Compilation } from './types'
import { AstSequence, VariableName } from '../ast/types'
import { Sequence } from '../ast/declare'

export default (
    { outletListenerSpecs, codeVariableNames }: Compilation,
    generateOutletListener: (
        variableName: VariableName,
        nodeId: DspGraph.NodeId,
        outletId: DspGraph.PortletId
    ) => AstSequence
) =>
    Sequence([
        Object.entries(outletListenerSpecs).map(([nodeId, outletIds]) =>
            outletIds.map((outletId) => {
                const listenerVariableName =
                    codeVariableNames.outletListeners[nodeId][outletId]
                return generateOutletListener(
                    listenerVariableName,
                    nodeId,
                    outletId
                )
            })
        ),
    ])
