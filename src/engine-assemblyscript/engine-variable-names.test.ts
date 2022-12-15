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

import { makeGraph } from "@webpd/dsp-graph/src/test-helpers"
import assert from "assert"
import { generateEngineVariableNames } from "../engine-variable-names"
import { EngineVariableNames, AccessorSpecs, NodeImplementations } from "../types"
import { attachAccessorsVariableNames } from "./engine-variable-names"

describe('engine-assemblyscript', () => {
    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        DUMMY: {
            loop: () => `// [DUMMY] loop`,
        },
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
    }
    
    describe('attachAccessorsVariableNames', () => {
        it('should attach accessors variable names', () => {
            const engineVariableNames: EngineVariableNames =
                generateEngineVariableNames(
                    NODE_IMPLEMENTATIONS,
                    makeGraph({
                        node1: {
                            inlets: {
                                inlet1: { type: 'message', id: 'inlet1' },
                                inlet2: { type: 'message', id: 'inlet2' },
                            },
                        },
                    })
                )
            const accessorSpecs: AccessorSpecs = {
                node1_INS_inlet1: { access: 'r', type: 'signal' },
                node1_INS_inlet2: { access: 'rw', type: 'message' },
            }
            attachAccessorsVariableNames(engineVariableNames, accessorSpecs)
            assert.deepStrictEqual(engineVariableNames.accessors, {
                node1_INS_inlet1: {
                    r: 'read_node1_INS_inlet1',
                },
                node1_INS_inlet2: {
                    r_length: 'read_node1_INS_inlet2_length',
                    r_elem: 'read_node1_INS_inlet2_elem',
                    r: 'read_node1_INS_inlet2',
                    w: 'write_node1_INS_inlet2',
                },
            })
        })
    })
})