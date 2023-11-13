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

import { Sequence, Func, Var } from '../ast/declare'
import { AstSequence } from '../ast/types'
import { Compilation } from './types'

export default ({
    inletCallerSpecs,
    variableNamesIndex,
}: Compilation): AstSequence =>
    // Here not possible to assign directly the receiver because otherwise assemblyscript
    // doesn't export a function but a global instead.
    Sequence(
        Object.entries(inletCallerSpecs).map(([nodeId, inletIds]) =>
            inletIds.map(
                (inletId) =>
                    Func(
                        variableNamesIndex.inletCallers[nodeId][inletId],
                        [Var('Message', 'm')],
                        'void'
                    )`${variableNamesIndex.nodes[nodeId].rcvs[inletId]}(m)`
            )
        )
    )
