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

import { makeGraph } from '@webpd/shared/test-helpers'
import assert from 'assert'
import { Compilation, generateEngineVariableNames, validateSettings } from '../compilation'
import { makeCompilation } from '../test-helpers'
import { CompilerSettings, NodeImplementations } from '../types'
import compileToJavascript from './compile-to-javascript'
import MACROS from './macros'
import { JavaScriptEngine } from './types'

describe('compileToJavascript', () => {

    const NODE_IMPLEMENTATIONS: NodeImplementations = {
        'osc~': {
            initialize: () => `// [osc~] setup`,
            loop: () => `// [osc~] loop`,
        },
        'dac~': {
            initialize: () => `// [dac~] setup`,
            loop: () => `// [dac~] loop`,
        },
    }

    it('should create the specified ports', () => {
        const compilation: Compilation = makeCompilation({
            nodeImplementations: NODE_IMPLEMENTATIONS, 
            portSpecs: {
                bla: { access: 'r', type: 'float' },
                blo: { access: 'w', type: 'messages' },
                bli: { access: 'rw', type: 'float' },
                blu: { access: 'rw', type: 'messages' },
            },
            macros: MACROS,
        })
        
        const code = compileToJavascript(compilation)
        const engine: JavaScriptEngine = new Function(`
            let bla = 1
            let blo = [['bang']]
            let bli = 2
            let blu = [[123.123, 'bang']]
            ${code}
        `)()

        assert.deepStrictEqual(Object.keys(engine.ports), [
            'read_bla',
            'write_blo',
            'read_bli',
            'write_bli',
            'read_blu',
            'write_blu',
        ])

        assert.strictEqual(engine.ports.read_bla(), 1)

        assert.strictEqual(engine.ports.read_bli(), 2)
        engine.ports.write_bli(666.666)
        assert.strictEqual(engine.ports.read_bli(), 666.666)

        const blu = engine.ports.read_blu()
        assert.deepStrictEqual(blu, [[123.123, 'bang']])
        blu.push(['I am blu'])
        assert.deepStrictEqual(engine.ports.read_blu(), [
            [123.123, 'bang'],
            ['I am blu'],
        ])
        engine.ports.write_blu([['blurg']])
        assert.deepStrictEqual(engine.ports.read_blu(), [['blurg']])
    })

    it('should be a JavaScript engine when evaled', () => {
        const graph = makeGraph({
            osc: {
                type: 'osc~',
                args: {
                    frequency: 440,
                },
                inlets: {
                    '0_control': { id: '0_control', type: 'control' },
                },
                outlets: { '0': { id: '0', type: 'signal' } },
            },
        })
        const compilation: Compilation = makeCompilation({
            graph, 
            nodeImplementations: NODE_IMPLEMENTATIONS, 
            macros: MACROS,
        })
        const code = compileToJavascript(compilation)
        const modelEngine: JavaScriptEngine = {
            configure: (_: number) => {},
            loop: () => new Float32Array(),
            setArray: () => undefined,
            ports: {},
        }
        const engine = new Function(code)()

        assert.deepStrictEqual(Object.keys(engine), Object.keys(modelEngine))
    })
})
