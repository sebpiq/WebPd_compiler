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

import assert from 'assert'
import jsMacros from './engine-javascript/macros'
import ascMacros from './engine-assemblyscript/macros'
import {
    getNodeImplementation,
    renderCode,
    wrapMacros,
} from './compile-helpers'
import { makeCompilation } from './test-helpers'
import { NodeImplementations } from './types'

describe('compile-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })
    })

    describe('wrapMacros', () => {
        it('should bind assemblyscript macros to pass compilation as first argument', () => {
            const compilation = makeCompilation({
                macros: ascMacros,
                target: 'assemblyscript',
            })
            const wrappedMacros = wrapMacros(ascMacros, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla: f32')
        })

        it('should bind javascript macros to pass compilation as first argument', () => {
            const compilation = makeCompilation({
                macros: jsMacros,
                target: 'javascript',
            })
            const wrappedMacros = wrapMacros(jsMacros, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla')
        })
    })

    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            someNodeType: { loop: () => `` },
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType'),
                NODE_IMPLEMENTATIONS['someNodeType']
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() =>
                getNodeImplementation(
                    NODE_IMPLEMENTATIONS,
                    'someUnknownNodeType'
                )
            )
        })
    })
})
