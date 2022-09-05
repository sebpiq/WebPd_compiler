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
import JS_MACROS from './engine-javascript/macros'
import ASC_MACROS from './engine-assemblyscript/macros'
import { createNamespace, getNodeImplementation, renderCode, wrapMacros } from './compile-helpers'
import { makeCompilation } from './test-helpers'
import { NodeImplementations } from './types'

describe('code-helpers', () => {
    describe('renderCode', () => {
        it('should render code lines with arbitrary depth', () => {
            const code = renderCode`bla
${['blo', 'bli', ['blu', ['ble', 'bly']]]}`

            assert.strictEqual(code, 'bla\nblo\nbli\nblu\nble\nbly')
        })
    })

    describe('createNamespace', () => {
        it('should proxy access to exisinting keys', () => {
            const namespace = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.strictEqual(namespace.bla, '1')
            assert.strictEqual(namespace.hello, '2')
        })

        it('should create automatic $ alias for keys starting with a number', () => {
            const namespace: { [key: string]: string } = createNamespace({
                '0': 'blabla',
                '0_bla': 'bloblo',
            })
            assert.strictEqual(namespace.$0, 'blabla')
            assert.strictEqual(namespace.$0_bla, 'bloblo')
        })

        it('should throw error when trying to access unknown key', () => {
            const namespace: { [key: string]: string } = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.throws(() => namespace.blo)
        })

        it('should not prevent from using JSON stringify', () => {
            const namespace: { [key: string]: string } = createNamespace({
                bla: '1',
                hello: '2',
            })
            assert.deepStrictEqual(
                JSON.stringify(namespace),
                '{"bla":"1","hello":"2"}'
            )
        })
    })

    describe('wrapMacros', () => {
        
        it('should bind assemblyscript macros to pass compilation as first argument', () => {
            const compilation = makeCompilation({macros: ASC_MACROS})
            const wrappedMacros = wrapMacros(ASC_MACROS, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla: f32')
        })
    
        it('should bind javascript macros to pass compilation as first argument', () => {
            const compilation = makeCompilation({macros: JS_MACROS})
            const wrappedMacros = wrapMacros(JS_MACROS, compilation)
            assert.strictEqual(wrappedMacros.typedVarFloat('bla'), 'bla')
        })
    })

    describe('getNodeImplementation', () => {
        const NODE_IMPLEMENTATIONS: NodeImplementations = {
            'someNodeType': {loop: () => ``}
        }

        it('should return node implementation if it exists', () => {
            assert.strictEqual(
                getNodeImplementation(NODE_IMPLEMENTATIONS, 'someNodeType'), 
                NODE_IMPLEMENTATIONS['someNodeType']
            )
        })

        it('should throw an error if implementation doesnt exist', () => {
            assert.throws(() => getNodeImplementation(NODE_IMPLEMENTATIONS, 'someUnknownNodeType'))
        })
    })
})
