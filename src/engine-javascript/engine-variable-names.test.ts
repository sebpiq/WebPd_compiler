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

import { makeGraph } from '@webpd/dsp-graph/src/test-helpers'
import assert from 'assert'
import { generate } from '../engine-common/engine-variable-names'
import {
    EngineVariableNames,
    AccessorSpecs,
    NodeImplementations,
} from '../types'
import { attachAccessors } from './engine-variable-names'

describe('engine-javascript.engine-variable-names', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
        DUMMY: {
            loop: () => '',
        },
    }

    describe('attachAccessorsVariableNames', () => {
        it('should attach accessors variable names', () => {
            const engineVariableNames: EngineVariableNames = generate(
                NODE_IMPLEMENTATIONS,
                makeGraph({
                    node1: {
                        inlets: {
                            inlet1: { type: 'message', id: 'inlet1' },
                            inlet2: { type: 'message', id: 'inlet2' },
                        },
                    },
                }),
                false
            )
            const accessorSpecs: AccessorSpecs = {
                node1_INS_inlet1: { access: 'r', type: 'signal' },
                node1_INS_inlet2: { access: 'rw', type: 'signal' },
            }
            attachAccessors(engineVariableNames, accessorSpecs)
            assert.deepStrictEqual(engineVariableNames.accessors, {
                node1_INS_inlet1: {
                    r: 'read_node1_INS_inlet1',
                },
                node1_INS_inlet2: {
                    r: 'read_node1_INS_inlet2',
                    w: 'write_node1_INS_inlet2',
                },
            })
        })
    })
})
