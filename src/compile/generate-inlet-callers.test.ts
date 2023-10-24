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
import { makeGraph } from '../dsp-graph/test-helpers'
import { makeCompilation } from '../test-helpers'
import { normalizeCode } from '../test-helpers'
import { NodeImplementations } from './types'
import generateInletCallers from './generate-inlet-callers'

describe('generateInletCallers', () => {
    it('should compile declared inlet callers', () => {
        const graph = makeGraph({
            add: {
                type: '+',
                inlets: {
                    '0': { id: '0', type: 'message' },
                },
            },
        })

        const nodeImplementations: NodeImplementations = {
            '+': {
                generateMessageReceivers: () => ({
                    '0': '// [+] message receiver',
                }),
            },
        }

        const compilation = makeCompilation({
            target: 'javascript',
            graph,
            inletCallerSpecs: { add: ['0'] },
            nodeImplementations,
        })

        const declareCode = generateInletCallers(compilation)

        assert.strictEqual(
            normalizeCode(declareCode),
            normalizeCode(`
                    function inletCaller_add_0 (m) {add_RCVS_0(m)}
                `)
        )
    })
})
