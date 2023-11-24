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

import assert from 'assert'
import { NodeImplementations } from './types'
import { makeCompilation } from '../test-helpers'
import generateInitializationsNodes from './generate-initializations-nodes'
import { makeGraph } from '../dsp-graph/test-helpers'
import { assertAstSequencesAreEqual } from '../ast/test-helpers'
import { ast, Var } from '../ast/declare'

describe('generateInitializationsNodes', () => {

    it('should generate initializations for nodes', () => {
        const graph = makeGraph({
            node1: {
                type: 'type1',
            },
            node2: {
                type: 'type2',
            },
        })

        const nodeImplementations: NodeImplementations = {
            type1: {
                generateInitialization: () => ast`
                    ${Var('Float', 'node1', '0')}
                    console.log(node1)
                `,
            },
            type2: {},
        }

        const compilation = makeCompilation({
            graph,
            graphTraversalDeclare: ['node1', 'node2'],
            nodeImplementations,
        })

        const sequence = generateInitializationsNodes(compilation)

        assertAstSequencesAreEqual(sequence, {
            astType: 'Sequence',
            content: [Var('Float', 'node1', '0'), 'console.log(node1)'],
        })
    })
})
